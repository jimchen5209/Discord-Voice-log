import { CommandClient, Member, MessageContent, VoiceChannel } from 'eris';
import fs from 'fs';
import { Category } from 'logging-ts';
import moment from 'moment';
import schedule from 'node-schedule';
import path from 'path';
import Queue from 'promise-queue';
import { vsprintf } from 'sprintf-js';
import { Core } from '../../..';
import { Lang } from '../../../Core/Lang';
import { ServerConfigManager } from '../../../Core/ServerConfigManager';
import { TTSHelper } from '../../../Core/TTSHelper';
import { Discord } from '../Core';
import { DiscordVoice } from './Voice';

export class VoiceLog {
    private bot: CommandClient;
    private audios: { [key: string]: DiscordVoice } = {};
    private logger: Category;
    private data: ServerConfigManager;
    private lang: Lang;
    private ttsHelper: TTSHelper;

    constructor(core: Core, discord: Discord, bot: CommandClient, logger: Category) {
        this.bot = bot;
        this.logger = logger;
        this.data = core.data;
        this.lang = discord.lang;
        this.ttsHelper = discord.ttsHelper;

        this.bot.on('voiceChannelJoin', async (member: Member, newChannel: VoiceChannel) => {
            if (member.id === this.bot.user.id) return;
            const channelID = await this.autoLeaveChannel(undefined, newChannel, member.guild.id);
            const voice = channelID ? this.audios[channelID] : undefined;
            const data = await this.data.get(member.guild.id);

            if (data) {
                if (data.channelID !== '') {
                    this.bot.createMessage(data.channelID, this.genVoiceLogEmbed(member, data.lang, 'join', undefined, newChannel));
                }
            }

            if (newChannel.id === channelID) {
                if (voice) voice.playVoice(member, 'join');
            }
        });

        this.bot.on('voiceChannelLeave', async (member: Member, oldChannel: VoiceChannel) => {
            if (member.id === this.bot.user.id) return;
            const channelID = await this.autoLeaveChannel(oldChannel, undefined, member.guild.id);
            const voice = channelID ? this.audios[channelID] : undefined;
            const data = await this.data.get(member.guild.id);
            if (data) {
                if (data.channelID !== '') {
                    this.bot.createMessage(data.channelID, this.genVoiceLogEmbed(member, data.lang, 'leave', oldChannel, undefined));
                }
            }
            if (oldChannel.id === channelID) {
                if (voice) voice.playVoice(member, 'left');
            }
        });

        this.bot.on('voiceChannelSwitch', async (member: Member, newChannel: VoiceChannel, oldChannel: VoiceChannel) => {
            if (member.id === this.bot.user.id) {
                this.data.updateLastVoiceChannel(member.guild.id, newChannel.id);
                this.data.updateCurrentVoiceChannel(member.guild.id, '');
                return;
            }
            const channelID = await this.autoLeaveChannel(oldChannel, newChannel, member.guild.id);
            const voice = channelID ? this.audios[channelID] : undefined;
            const data = await this.data.get(member.guild.id);

            if (data) {
                if (data.channelID !== '') {
                    this.bot.createMessage(data.channelID, this.genVoiceLogEmbed(member, data.lang, 'move', oldChannel, newChannel));
                }
            }
            if (oldChannel.id === channelID) {
                if (voice) voice.playVoice(member, 'switched_out');
            }
            if (newChannel.id === channelID) {
                if (voice) voice.playVoice(member, 'switched_in');
            }
        });
    }

    public async start() {
        if (!fs.existsSync('./assets')) fs.mkdirSync('./assets');
        if (!fs.existsSync('./caches')) fs.mkdirSync('./caches');
        const channels = await this.data.getCurrentChannels();
        channels.forEach(element => {
            this.logger.info(`Reconnecting to ${element.currentVoiceChannel}...`);
            this.audios[element.currentVoiceChannel] = new DiscordVoice(this.bot, this.logger, this.ttsHelper, element.currentVoiceChannel);
        });
        schedule.scheduleJob('0 0 * * *', () => { this.refreshCache(undefined); });
    }

    public getCurrentVoice(guildId: string): DiscordVoice | undefined{
        const voice = this.audios[guildId];
        if (!voice) {
            const botVoice = this.bot.voiceConnections.get(guildId);
            if (botVoice && botVoice.ready) {
                this.audios[guildId] = new DiscordVoice(this.bot, this.logger, this.ttsHelper, botVoice.id, botVoice);
                return this.audios[guildId];
            }
            return undefined;
        } else if (!voice.isReady()) {
            this.destroy(guildId);
            return undefined;
        }

        return this.audios[guildId];
    }

    public async join(guildId: string, channelId: string, updateDatabase = false, playJoin = false): Promise<DiscordVoice> {
        if (this.audios[guildId]) {
            if (!this.audios[guildId].isReady()) {
                this.destroy(guildId);
            } else if (this.audios[guildId].channelId !== channelId) {
                this.audios[guildId].switchChannel(channelId);

                if (updateDatabase) {
                    this.data.updateLastVoiceChannel(guildId, '');
                    this.data.updateCurrentVoiceChannel(guildId, channelId);
                }

                if (playJoin) this.audios[guildId].playMoved();
                return this.audios[guildId];
            } else {
                return this.audios[guildId];
            }
        }
        
        this.audios[guildId] = new DiscordVoice(this.bot, this.logger, this.ttsHelper, channelId);
        if (updateDatabase) {
            this.data.updateLastVoiceChannel(guildId, '');
            this.data.updateCurrentVoiceChannel(guildId, channelId);
        }

        if (playJoin) this.audios[guildId].playReady();

        return this.audios[guildId];
    }

    public async destroy(guildId: string, updateDatabase = false) {
        this.audios[guildId].destroy();
        delete this.audios[guildId];
        if (updateDatabase) {
            this.data.updateLastVoiceChannel(guildId, '');
            this.data.updateCurrentVoiceChannel(guildId, '');
        }
    }

    private async sleep(guildId: string, channelId: string){
        this.destroy(guildId);
        this.data.updateLastVoiceChannel(guildId, channelId);
        this.data.updateCurrentVoiceChannel(guildId, '');
    }

    public async refreshCache(channelID: string | undefined) {
        this.logger.info('Starting cache refresh...');
        const title = '➡️ Refreshing Caches';
        let seekCounter = 0;
        let seekFilename = '';
        let seekDone = false;
        let seekField = {
            name: `${seekDone ? '✅' : '➡️'} Seeking for files ...${seekDone ? ' Done' : ''}`,
            value: `${(seekDone || seekCounter === 0) ? '' : `Current ${seekFilename}, `} Seeked ${seekCounter} files. `
        };
        let progressMessage = this.genProgressMessage(title, [seekField]);
        const message = (channelID !== undefined) ? await this.bot.createMessage(channelID, progressMessage) : undefined;
        let progressCount = 0;
        let progressTotal = 0;
        const queue = new Queue(1, Infinity);
        const getTTS = (text: string, lang: string) => {
            return new Promise<void>((res) => {
                progressCount++;
                const progressField = {
                    name: '➡️ Processing texts...',
                    value: `(${progressCount}/${progressTotal}) ${text} in ${lang}`
                };
                progressMessage = this.genProgressMessage(title, [seekField, progressField]);
                if (message !== undefined) message.edit(progressMessage);
                this.ttsHelper.getTTSFile(text, lang).then(fileName => {
                    this.logger.info(`(${progressCount}/${progressTotal}) ${text} in ${lang} -> ${fileName}`);
                    if (fileName !== null) ttsList.push(fileName);
                    setTimeout(() => { res(); }, 500);
                });
            });
        };
        const getWaveTTS = (text: string, lang: string, voice: string) => {
            return new Promise<void>((res) => {
                progressCount++;
                const progressField = {
                    name: '➡️ Processing texts...',
                    value: `(${progressCount}/${progressTotal}) ${text} in ${lang} with voice ${voice}`
                };
                progressMessage = this.genProgressMessage(title, [seekField, progressField]);
                if (message !== undefined) message.edit(progressMessage);
                this.ttsHelper.getWaveTTS(text, lang, voice).then(fileName => {
                    this.logger.info(`(${progressCount}/${progressTotal}) ${text} in ${lang} with voice ${voice} -> ${fileName}`);
                    if (fileName !== null) ttsList.push(fileName);
                    setTimeout(() => { res(); }, 500);
                });
            });
        };
        const ttsList: string[] = [];
        queue.add(() => getWaveTTS('VoiceLog TTS is moved to your channel.', 'en-US', 'en-US-Wavenet-D'));
        queue.add(() => getWaveTTS('VoiceLog TTS is ready.', 'en-US', 'en-US-Wavenet-D'));
        progressTotal += 2;
        const typeList = ['join', 'left', 'switched_out', 'switched_in'];
        const files = fs.readdirSync('assets/');
        files.forEach(file => {
            if (path.extname(file) === '.json') {
                seekCounter++;
                seekFilename = file;
                seekField = {
                    name: `${seekDone ? '✅' : '➡️'} Seeking for files ...${seekDone ? ' Done' : ''}`,
                    value: `${(seekDone || seekCounter === 0) ? '' : `Current ${seekFilename}, `} Seeked ${seekCounter} files. `
                };
                const tts = JSON.parse(fs.readFileSync(`assets/${file}`, { encoding: 'utf-8' }));
                if (tts.use_wave_tts && tts.lang && tts.voice) {
                    typeList.forEach(type => {
                        if (tts[type]) {
                            progressTotal++;
                            queue.add(() => getWaveTTS(tts[type], tts.lang, tts.voice));
                        }
                    });
                } else if (tts.lang) {
                    typeList.forEach(type => {
                        if (tts[type]) {
                            progressTotal++;
                            queue.add(() => getTTS(tts[type], tts.lang));
                        }
                    });
                }
            }
        });
        seekDone = true;
        seekField = {
            name: `${seekDone ? '✅' : '➡️'} Seeking for files ...${seekDone ? ' Done' : ''}`,
            value: `${(seekDone || seekCounter === 0) ? '' : `Current ${seekFilename}, `} Seeked ${seekCounter} files. `
        };
        const afterWork = () => {
            return new Promise<void>((res) => {
                const progressField = {
                    name: '✅ Processing files... Done',
                    value: `Processed ${progressTotal} texts.`
                };
                let cacheRemoveCount = 0;
                let cacheField = {
                    name: '➡️ Removing unused cache...',
                    value: (cacheRemoveCount === 0) ? 'Seeking...' : `Removed ${cacheRemoveCount} unused ${(cacheRemoveCount === 1) ? 'cache' : 'caches'}.`
                };
                progressMessage = this.genProgressMessage(title, [seekField, progressField, cacheField]);
                if (message !== undefined) message.edit(progressMessage);
                const cacheFiles = fs.readdirSync('caches/');
                cacheFiles.forEach(file => {
                    if (!ttsList.includes(`./caches/${file}`)) {
                        fs.unlinkSync(`./caches/${file}`);
                        this.logger.info(`Deleted unused file ./caches/${file}`);
                        cacheRemoveCount++;
                        progressMessage = this.genProgressMessage(title, [seekField, progressField, cacheField]);
                        if (message !== undefined) message.edit(progressMessage);
                    }
                });
                cacheField = {
                    name: '✅ Removing unused cache... Done',
                    value: (cacheRemoveCount === 0) ? 'No unused caches found.' : `Removed ${cacheRemoveCount} unused ${(cacheRemoveCount === 1) ? 'cache' : 'caches'}.`
                };
                progressMessage = this.genProgressMessage('✅ Refresh Caches Done', [seekField, progressField, cacheField], true);
                if (message !== undefined) message.edit(progressMessage);
                res();
            });
        };
        queue.add(() => afterWork());
    }

    private genVoiceLogEmbed(member: Member, lang: string, type: string, oldChannel: VoiceChannel | undefined, newChannel: VoiceChannel | undefined) {
        let color: number;
        let content: string;
        switch (type) {
        case 'join':
            color = 4289797;
            content = vsprintf(this.lang.get(lang).display.voice_log.joined, [newChannel?.name]);
            break;
        case 'leave':
            color = 8454161;
            content = vsprintf(this.lang.get(lang).display.voice_log.left, [oldChannel?.name]);
            break;
        case 'move':
            color = 10448150;
            content = vsprintf('%0s ▶️ %1s', [oldChannel?.name, newChannel?.name]);
            break;
        default:
            color = 6776679;
            content = 'Unknown type';
            break;
        }
        return {
            embed: {
                color,
                title: member.nick ? member.nick : member.username,
                description: content,
                timestamp: moment().toISOString(),
                author: { name: '𝅺', icon_url: member.avatarURL }
            }
        } as MessageContent;
    }

    private genProgressMessage(title: string, fields: Array<{ name: string, value: string }>, isDone = false) {
        return {
            embed: {
                color: (isDone) ? 4289797 : 16312092,
                title,
                fields
            }
        } as MessageContent;
    }

    private async autoLeaveChannel(oldChannel: VoiceChannel | undefined, newChannel: VoiceChannel | undefined, guildId: string): Promise<string|undefined> {
        let channelToCheck: VoiceChannel | undefined;

        const voice = this.getCurrentVoice(guildId);
        const data = await this.data.get(guildId);

        if (voice?.isReady()) {
            channelToCheck = (oldChannel?.id === voice?.channelId) ? oldChannel : (newChannel?.id === voice?.channelId) ? newChannel : undefined;
        } else if (data) {
            channelToCheck = (oldChannel?.id === data.lastVoiceChannel) ? oldChannel : (newChannel?.id === data.lastVoiceChannel) ? newChannel : undefined;
        }

        if (!channelToCheck) return;

        let noUser = true;

        channelToCheck.voiceMembers?.forEach(user => {
            if (!user.bot) {
                noUser = false;
                return;
            }
        });

        if (noUser) {
            if (voice) {
                this.sleep(guildId, channelToCheck.id);
            }
            return;
        } else {
            this.join(guildId, channelToCheck.id, true);
            return channelToCheck.id;
        }
    }
}
