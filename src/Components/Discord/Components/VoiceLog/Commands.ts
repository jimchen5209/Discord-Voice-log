import { Message, MessageContent } from 'eris';
import { vsprintf } from 'sprintf-js';
import { Core } from '../../../..';
import { Config } from '../../../../Core/Config';
import { Lang } from '../../../../Core/Lang';
import { ServerConfigManager } from '../../../../Core/ServerConfigManager';
import { Discord } from '../../Core';
import { VoiceLog } from '../VoiceLog';
import { VoiceLogSetStatus } from './Text';

const ERR_MISSING_LANG = 'Language not exist.';
const ERR_MISSING_LANG_DEFAULT = 'Language not exist, will not change your language.';

export class VoiceLogCommands {
    private voiceLog: VoiceLog;
    private config: Config;
    private data: ServerConfigManager;
    private lang: Lang;

    constructor(voiceLog: VoiceLog, core: Core, discord: Discord) {
        this.config = core.config;
        this.data = core.data;
        this.lang = discord.lang;
        this.voiceLog = voiceLog;
    }

    public async commandJoin(msg: Message) {
        if (!msg.member) return;

        const data = await this.data.getOrCreate(msg.member.guild.id);

        if (!(msg.member.permissions.has('manageMessages')) && !(this.config.discord.admins.includes(msg.member.id))) {
            msg.channel.createMessage(this.genErrorMessage(this.lang.get(data.lang).display.command.no_permission));
            return;
        }

        const guildId = msg.member.guild.id;
        const channelID = msg.member.voiceState.channelID;
        if (channelID) {
            const voice = this.voiceLog.voice.getCurrentVoice(guildId);
            if (voice && voice.channelId === channelID) {
                msg.channel.createMessage(this.genNotChangedMessage(this.lang.get(data.lang).display.command.already_connected));
            } else {
                this.voiceLog.voice.join(guildId, channelID, true, true);
            }
        } else {
            msg.channel.createMessage(this.genErrorMessage(this.lang.get(data.lang).display.command.not_in_channel));
        }
    }

    public async commandLeave(msg: Message) {
        if (!msg.member) return;

        const data = await this.data.getOrCreate(msg.member.guild.id);

        if (!(msg.member.permissions.has('manageMessages')) && !(this.config.discord.admins.includes(msg.member.id))) {
            msg.channel.createMessage(this.genErrorMessage(this.lang.get(data.lang).display.command.no_permission));
            return;
        }
        const guildId = msg.member.guild.id;

        const voice = this.voiceLog.voice.getCurrentVoice(guildId);

        if (voice) {
            this.voiceLog.voice.destroy(guildId, true);
        }
    }

    public async commandsetVlog(msg: Message, args: string[]) {
        if (!msg.member) return;

        const data = await this.data.getOrCreate(msg.member.guild.id);

        if (!(msg.member.permissions.has('manageMessages')) && !(this.config.discord.admins.includes(msg.member.id))) {
            msg.channel.createMessage(this.genErrorMessage(this.lang.get(data.lang).display.command.no_permission));
            return;
        }

        const guildId = msg.member.guild.id;
        const channelId = msg.channel.id;

        if (args.length === 0) {
            switch (await this.voiceLog.text.setVoiceLog(guildId, channelId)) {
                case VoiceLogSetStatus.NotChanged:
                    msg.channel.createMessage(this.genNotChangedMessage(this.lang.get(data.lang).display.config.exist));
                    return;
                case VoiceLogSetStatus.ChannelSuccess:
                    msg.channel.createMessage(this.genSuccessMessage(this.lang.get(data.lang).display.config.success));
                    return;
            }
        } else {
            const newLang = args[0];

            try {
                switch (await this.voiceLog.text.setVoiceLog(guildId, channelId, newLang)) {
                    case VoiceLogSetStatus.AllSuccess:
                        msg.channel.createMessage(this.genSuccessMessage(this.lang.get(newLang).display.config.success));
                        return;
                    case VoiceLogSetStatus.ChannelSuccess:
                        msg.channel.createMessage(this.genSuccessMessage(this.lang.get(newLang).display.config.success));
                        return;
                    case VoiceLogSetStatus.ChannelSuccess_MissingLang:
                        msg.channel.createMessage(this.genErrorMessage(ERR_MISSING_LANG_DEFAULT));
                        msg.channel.createMessage(this.genSuccessMessage(this.lang.get(data.lang).display.config.success));
                        return;
                    case VoiceLogSetStatus.LangSuccess:
                        msg.channel.createMessage(this.genSuccessMessage(vsprintf(this.lang.get(newLang).display.config.lang_success, [this.lang.get(newLang).displayName])));
                        msg.channel.createMessage(this.genNotChangedMessage(this.lang.get(newLang).display.config.exist));
                        return;
                    case VoiceLogSetStatus.MissingLang:
                        msg.channel.createMessage(this.genErrorMessage(ERR_MISSING_LANG_DEFAULT));
                        msg.channel.createMessage(this.genNotChangedMessage(this.lang.get(data.lang).display.config.exist));
                        return;
                    case VoiceLogSetStatus.NotChanged:
                        msg.channel.createMessage(this.genNotChangedMessage(this.lang.get(data.lang).display.config.exist));
                        return;
                }
            } catch {
                msg.channel.createMessage(this.genErrorMessage(this.lang.get(data.lang).display.config.error));
            }
        }
    }

    public async commandLang(msg: Message, args: string[]) {
        if (!msg.member) return;

        const data = await this.data.getOrCreate(msg.member.guild.id);

        if (!(msg.member.permissions.has('manageMessages')) && !(this.config.discord.admins.includes(msg.member.id))) {
            msg.channel.createMessage(this.genErrorMessage(this.lang.get(data.lang).display.command.no_permission));
            return;
        }

        const guildId = msg.member.guild.id;
        const newLang = args[0];

        switch (await this.voiceLog.text.setLang(guildId, newLang)) {
            case VoiceLogSetStatus.LangSuccess:
                msg.channel.createMessage(this.genSuccessMessage(vsprintf(this.lang.get(newLang).display.config.lang_success, [this.lang.get(newLang).displayName])));
                return;
            case VoiceLogSetStatus.MissingLang:
                msg.channel.createMessage(this.genErrorMessage(ERR_MISSING_LANG));
                return;
            case VoiceLogSetStatus.NotChanged:
                msg.channel.createMessage(this.genNotChangedMessage(vsprintf(this.lang.get(data.lang).display.config.lang_exist, [this.lang.get(data.lang).displayName])));
                return;
            default:
                msg.channel.createMessage(this.genErrorMessage(this.lang.get(data.lang).display.config.error));
                return;
        }
    }

    public async commandUnsetVlog(msg: Message) {
        if (!msg.member) return;

        const data = await this.data.getOrCreate(msg.member.guild.id);

        if (!(msg.member.permissions.has('manageMessages')) && !(this.config.discord.admins.includes(msg.member.id))) {
            msg.channel.createMessage(this.genErrorMessage(this.lang.get(data.lang).display.command.no_permission));
            return;
        }

        this.voiceLog.text.unsetVoiceLog(msg.member.guild.id);
        msg.channel.createMessage(this.genSuccessMessage(this.lang.get(data.lang).display.config.unset_success));
    }

    public async commandRefreshCache(msg: Message) {
        if (!msg.member) return;

        const data = await this.data.getOrCreate(msg.member.guild.id);

        if (!(this.config.discord.admins.includes(msg.member.id))) {
            msg.channel.createMessage(this.genErrorMessage(this.lang.get(data.lang).display.command.no_permission));
            return;
        }

        this.voiceLog.voice.refreshCache(msg.channel.id);
    }

    private genSuccessMessage(msg: string) {
        return {
            embed: {
                title: 'Success',
                color: 4289797,
                description: msg
            }
        } as MessageContent;
    }

    private genNotChangedMessage(msg: string) {
        return {
            embed: {
                title: 'Nothing Changed',
                color: 9274675,
                description: msg
            }
        } as MessageContent;
    }

    private genErrorMessage(msg: string) {
        return {
            embed: {
                title: 'Error',
                color: 13632027,
                description: msg
            }
        } as MessageContent;
    }
}