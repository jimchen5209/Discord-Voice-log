import { waitUntil } from 'async-wait-until';
import { Client, Member, VoiceConnection  } from 'eris';
import FFmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import { Category } from 'logging-ts';
import Queue from 'promise-queue';
import { TTSHelper } from '../../../Core/TTSHelper';
import { PluginManager } from '../../Plugin/Core';

export class DiscordVoice {
    private _init = true;
    private _channelId: string;
    private bot: Client;
    private voice: VoiceConnection | undefined;
    private logger: Category;
    private queue: Queue = new Queue(1, Infinity);
    private plugins: PluginManager;
    private ttsHelper: TTSHelper;

    constructor(
        bot: Client,
        logger: Category,
        plugins: PluginManager,
        ttsHelper: TTSHelper,
        channel: string,
        voice: VoiceConnection | undefined = undefined
    ) {
        this.bot = bot;
        this.logger = logger;
        this.ttsHelper = ttsHelper;
        this.plugins = plugins;

        this._channelId = channel;

        if (voice && voice.ready) {
            this.voice = voice;
            this._init = false;
            this.logger.info(`Using the existing voice connection for ${this._channelId}`);
        } else {
            this.joinVoiceChannel(channel).then(connection => {
                this.voice = connection;
                if (connection) {
                    this._init = false;
                    this.logger.info(`Connected to ${this._channelId}`);
                }
            });
        }
    }

    public switchChannel(channel: string) {
        this.destroy();

        this._channelId = channel;

        this.joinVoiceChannel(channel).then(connection => {
            this.voice = connection;
        });
    }

    public get channelId() {
        return this._channelId;
    }

    public get init() {
        return this._init;
    }

    public async playReady() {
        const voiceFile = await this.ttsHelper.getWaveTTS('VoiceLog is ready.', 'en-US', 'en-US-Wavenet-D');
        if (voiceFile !== null) this.queue.add(() => this.play(voiceFile));
    }

    public async playMoved() {
        const voiceFile = await this.ttsHelper.getWaveTTS('VoiceLog is moved to your channel.', 'en-US', 'en-US-Wavenet-D');
        if (voiceFile !== null) this.queue.add(() => this.play(voiceFile));
    }

    public async playVoice(member: Member, type: string) {
        let overwrited = false;

        for (const voice of this.plugins.voiceOverwrites) {
            const overwritedFile = await voice.playVoice(member, type);
            if (overwritedFile) {
                this.queue.add(() => this.play(overwritedFile));
                overwrited = true;
                return;
            }
        }

        if (overwrited) return;

        let voiceFile = '';
        if (fs.existsSync(`assets/${member.id}.json`)) {
            const tts = JSON.parse(fs.readFileSync(`assets/${member.id}.json`, { encoding: 'utf-8' }));
            if (tts.use_wave_tts && tts.lang && tts.voice && tts[type]) {
                voiceFile = await this.ttsHelper.getWaveTTS(tts[type], tts.lang, tts.voice);
            } else if (tts.lang && tts[type]) {
                const file = await this.ttsHelper.getTTSFile(tts[type], tts.lang);
                if (file !== null) {
                    voiceFile = file;
                } else if (fs.existsSync(`assets/${member.id}_${type}.wav`)) {
                    voiceFile = `assets/${member.id}_${type}.wav`;
                }
            } else if (fs.existsSync(`assets/${member.id}_${type}.wav`)) {
                voiceFile = `assets/${member.id}_${type}.wav`;
            }
        } else if (fs.existsSync(`assets/${member.id}_${type}.wav`)) {
            voiceFile = `assets/${member.id}_${type}.wav`;
        }
        if (voiceFile !== '') this.queue.add(() => this.play(voiceFile));
    }

    public isReady(): boolean {
        return (this.voice !== undefined) && this.voice.ready;
    }

    public destroy() {
        if (this.voice) {
            this.voice.stopPlaying();
            this.voice.removeAllListeners();
            if (this.voice.channelID) this.bot.leaveVoiceChannel(this.voice.channelID);
            this.voice = undefined;
        }
    }

    private async joinVoiceChannel(channelID: string): Promise<VoiceConnection | undefined> {
        this.logger.info(`Connecting to ${channelID}...`);
        try {
            const connection = await this.bot.joinVoiceChannel(channelID);
            connection.on('warn', (message: string) => {
                this.logger.warn(`Warning from ${channelID}: ${message}`);
            });
            connection.on('error', err => {
                this.logger.error(`Error from voice connection ${channelID}: ${err.message}`, err);
            });
            connection.once('ready', () => {
                this.logger.error('Voice connection reconnected.', null);
                const channelId = connection.channelID;
                if (channelId) {
                    if (channelId !== this._channelId) {
                        this.logger.warn(`Voice channel changed from ${this._channelId} to ${channelId}`);
                        this._channelId = channelId;
                    }
                    this.switchChannel(channelId);
                }
            });
            connection.once('disconnect', err => {
                this.logger.error(`Error from voice connection ${channelID}: ${err?.message}`, err);
                connection.stopPlaying();
                this.bot.leaveVoiceChannel(channelID);
                setTimeout(() => {
                    this.joinVoiceChannel(this._channelId || channelID).then(newConnection => {
                        this.voice = newConnection;
                    });
                }, 5 * 1000);
            });
            return connection;
        } catch (e) {
            if (e instanceof Error) {
                this.logger.error(`Error from ${channelID}: ${e.name} ${e.message}`, e);
            }
        }
        return;
    }

    private play(file: string) {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise<void>(async (res) => {
            if (file === '') {
                res();
                return;
            }
            this.logger.info(`Playing ${file}`);
            await waitUntil(() => this.voice && this.voice.ready);
            this.voice?.once('end', () => res());
            FFmpeg.ffprobe(file, (__, data) => {
                this.voice?.play(file);
                const time = data.format.duration || 0;
                setTimeout(() => {
                    this.voice?.stopPlaying();
                    res();
                }, time * 1200);
            });
        });
    }
}
