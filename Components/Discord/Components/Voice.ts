import { waitUntil } from 'async-wait-until';
import { CommandClient, Member, VoiceConnection  } from 'eris';
import FFmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import { Category } from 'logging-ts';
import Queue from 'promise-queue';
import { TTSHelper } from '../../../Core/TTSHelper';

export class DiscordVoice {
    private bot: CommandClient;
    private voice: VoiceConnection | undefined;
    private logger: Category;
    private queue: Queue = new Queue(1, Infinity);
    private ttsHelper: TTSHelper;

    constructor(
        bot: CommandClient,
        logger: Category,
        ttsHelper: TTSHelper,
        channel: string
    ) {
        this.bot = bot;
        this.logger = logger;
        this.ttsHelper = ttsHelper;

        this.joinVoiceChannel(channel).then(connection => {
            this.voice = connection;
        });
    }

    public switchChannel(channel: string) {
        this.destroy();

        this.joinVoiceChannel(channel).then(connection => {
            this.voice = connection;
        });
    }

    public async playReady() {
        const voiceFile = await this.ttsHelper.getWaveTTS('VoiceLog TTS is ready.', 'en-US', 'en-US-Wavenet-D');
        if (voiceFile !== null) this.queue.add(() => this.play(voiceFile));
    }

    public async playMoved() {
        const voiceFile = await this.ttsHelper.getWaveTTS('VoiceLog TTS is moved to your channel.', 'en-US', 'en-US-Wavenet-D');
        if (voiceFile !== null) this.queue.add(() => this.play(voiceFile));
    }

    public async playVoice(member: Member, type: string) {
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
            this.bot.leaveVoiceChannel(this.voice.channelID);
            this.voice = undefined;
        }
    }

    private async joinVoiceChannel(channelID: string): Promise<VoiceConnection|undefined> {
        this.logger.info(`Connecting to ${channelID}...`);
        try {
            const connection = await this.bot.joinVoiceChannel(channelID);
            connection.on('warn', (message: string) => {
                this.logger.warn(`Warning from ${channelID}: ${message}`);
            });
            connection.on('error', (err: Error) => {
                if (err) {
                    this.logger.error(`Error from ${channelID}: ${err.name} ${err.message}`, null);
                }
            });
            connection.on('disconnect', (err: Error) => {
                if (err) {
                    this.logger.error(`Error from ${channelID} that caused voice disconnect: ${err.name} ${err.message}`, null);
                    // setTimeout(() => {
                    //     connection.stopPlaying();
                    //     connection.removeAllListeners();
                    //     this.joinVoiceChannel(channelID).then(newConnection => {
                    //         this.voice = newConnection;
                    //     });
                    // }, 5000);
                }
            });
            return connection;
        } catch (e) {
            this.logger.error(`Error from ${channelID}: ${e.name} ${e.message}`, null);
        }
        return;
    }

    private play(file: string) {
        return new Promise<void>(async (res, _) => {
            if (file === '') return;
            this.logger.info(`Playing ${file}`);
            await waitUntil(() => this.voice && this.voice.ready);
            this.voice!.once('end', () => res());
            FFmpeg.ffprobe(file, (__, data) => {
                this.voice!.play(file);
                const time = data.format.duration || 0;
                setTimeout(() => {
                    this.voice!.stopPlaying();
                    res();
                }, time * 1200);
            });
        });
    }
}
