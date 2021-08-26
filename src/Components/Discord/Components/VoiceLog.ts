import { CommandClient, Member, MessageContent, VoiceChannel } from 'eris';
import fs from 'fs';
import { Category } from 'logging-ts';
import moment from 'moment';
import { scheduleJob } from 'node-schedule';
import Queue from 'promise-queue';
import { vsprintf } from 'sprintf-js';
import { Core } from '../../..';
import { Lang } from '../../../Core/Lang';
import { ServerConfigManager } from '../../../Core/ServerConfigManager';
import { Discord } from '../Core';
import { VoiceLogVoice } from './VoiceLog/Voice';

export class VoiceLog {
    private bot: CommandClient;
    private _voice: VoiceLogVoice;
    private queue: Queue = new Queue(1, Infinity);
    private logger: Category;
    private data: ServerConfigManager;
    private lang: Lang;

    constructor(core: Core, discord: Discord, bot: CommandClient, logger: Category) {
        this.bot = bot;
        this.logger = new Category('VoiceLog', logger);
        this.data = core.data;
        this.lang = discord.lang;
        this._voice = new VoiceLogVoice(core, discord, bot, logger);

        this.bot.on('voiceChannelJoin', async (member: Member, newChannel: VoiceChannel) => {
            this.queue.add(async () => {
                if (member.id === this.bot.user.id) return;
                const guildId = member.guild.id;
                const channelID = await this._voice.autoLeaveChannel(undefined, newChannel, guildId);
                const voice = this._voice.getCurrentVoice(guildId);
                const data = await this.data.get(guildId);

                if (data) {
                    if (data.channelID !== '') {
                        this.bot.createMessage(data.channelID, this.genVoiceLogEmbed(member, data.lang, 'join', undefined, newChannel));
                    }
                }

                if (newChannel.id === channelID) {
                    if (voice) voice.playVoice(member, 'join');
                }
            });
        });

        this.bot.on('voiceChannelLeave', async (member: Member, oldChannel: VoiceChannel) => {
            this.queue.add(async () => {
                if (member.id === this.bot.user.id) return;
                const guildId = member.guild.id;
                const channelID = await this._voice.autoLeaveChannel(oldChannel, undefined, guildId);
                const voice = this._voice.getCurrentVoice(guildId);
                const data = await this.data.get(guildId);
                if (data) {
                    if (data.channelID !== '') {
                        this.bot.createMessage(data.channelID, this.genVoiceLogEmbed(member, data.lang, 'leave', oldChannel, undefined));
                    }
                }
                if (oldChannel.id === channelID) {
                    if (voice) voice.playVoice(member, 'left');
                }
            });
        });

        this.bot.on('voiceChannelSwitch', async (member: Member, newChannel: VoiceChannel, oldChannel: VoiceChannel) => {
            this.queue.add(async () => {
                if (member.id === this.bot.user.id) {
                    this.data.updateLastVoiceChannel(member.guild.id, newChannel.id);
                    this.data.updateCurrentVoiceChannel(member.guild.id, '');
                    return;
                }
                const guildId = member.guild.id;
                const channelID = await this._voice.autoLeaveChannel(oldChannel, newChannel, guildId);
                const voice = this._voice.getCurrentVoice(guildId);
                const data = await this.data.get(guildId);

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
        });
    }

    public get voice() {
        return this._voice;
    }

    public async start() {
        if (!fs.existsSync('./assets')) fs.mkdirSync('./assets');
        if (!fs.existsSync('./caches')) fs.mkdirSync('./caches');
        const channels = await this.data.getCurrentChannels();
        channels.forEach(element => {
            this.logger.info(`Reconnecting to ${element.currentVoiceChannel}...`);
            this._voice.join(element.serverID, element.currentVoiceChannel);
        });
        scheduleJob('0 0 * * *', () => { this._voice.refreshCache(undefined); });
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

}
