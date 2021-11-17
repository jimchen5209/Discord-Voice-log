import { Client, Member, VoiceChannel } from 'eris';
import fs from 'fs';
import { Logger } from 'tslog-helper';
import { scheduleJob } from 'node-schedule';
import Queue from 'promise-queue';
import { Core } from '../../..';
import { ServerConfigManager } from '../../MongoDB/db/ServerConfig';
import { Discord } from '../Core';
import { VoiceLogCommands } from './VoiceLog/Commands';
import { VoiceLogText } from './VoiceLog/Text';
import { VoiceLogVoice } from './VoiceLog/Voice';

export class VoiceLog {
    private bot: Client;
    private _voice: VoiceLogVoice;
    private _text: VoiceLogText;
    private _command: VoiceLogCommands;
    private queue: Queue = new Queue(1, Infinity);
    private logger: Logger;
    private data: ServerConfigManager;

    constructor(core: Core, discord: Discord, bot: Client, logger: Logger) {
        this.bot = bot;
        this.logger = logger.getChildLogger({ name: 'VoiceLog'});
        this.data = core.data;
        this._voice = new VoiceLogVoice(core, discord, bot, logger);
        this._text = new VoiceLogText(core, discord, bot, logger);
        this._command = new VoiceLogCommands(this, core, discord, bot);

        this.bot.on('voiceChannelJoin', async (member: Member, newChannel: VoiceChannel) => {
            this.queue.add(async () => {
                if (member.id === this.bot.user.id) return;
                const guildId = member.guild.id;
                const channelID = await this._voice.autoLeaveChannel(undefined, newChannel, guildId);
                const voice = this._voice.getCurrentVoice(guildId);
                const data = await this.data.get(guildId);

                if (data) {
                    if (data.channelID !== '') {
                        this.bot.createMessage(data.channelID, this._text.genVoiceLogEmbed(member, data.lang, 'join', undefined, newChannel));
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
                        this.bot.createMessage(data.channelID, this._text.genVoiceLogEmbed(member, data.lang, 'leave', oldChannel, undefined));
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
                        this.bot.createMessage(data.channelID, this._text.genVoiceLogEmbed(member, data.lang, 'move', oldChannel, newChannel));
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

    public get text() {
        return this._text;
    }

    public get command() {
        return this._command;
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

}
