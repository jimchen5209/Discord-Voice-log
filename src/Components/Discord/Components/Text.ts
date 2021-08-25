import { CommandClient, Message, MessageContent, TextChannel } from 'eris';
import { Category } from 'logging-ts';
import { vsprintf } from 'sprintf-js';
import { Core } from '../../..';
import { Config } from '../../../Core/Config';
import { Lang } from '../../../Core/Lang';
import { ServerConfigManager } from '../../../Core/ServerConfigManager';
import { TTSHelper } from '../../../Core/TTSHelper';
import { Discord } from '../Core';
import { DiscordVoice } from './Voice';
import { VoiceLog } from './VoiceLog';

const ERR_MISSING_LANG = 'Language not exist.';
const ERR_MISSING_LANG_DEFAULT = 'Language not exist, will not change your language.';
const ERR_INSERT_FAILURE = Error('Data insert failed.');

export class DiscordText {
    public voiceLog: VoiceLog;
    private bot: CommandClient;
    private config: Config;
    private audios: { [key: string]: DiscordVoice } = {};
    private logger: Category;
    private data: ServerConfigManager;
    private lang: Lang;
    private ttsHelper: TTSHelper;

    constructor(core: Core, discord: Discord, bot: CommandClient, logger: Category) {
        this.config = core.config;
        this.bot = bot;
        this.logger = logger;
        this.audios = discord.audios;
        this.data = core.data;
        this.lang = discord.lang;
        this.voiceLog = discord.voiceLog;
        this.ttsHelper = discord.ttsHelper;

        this.bot.on('messageCreate', msg => {

            if (!msg.member) {
                return;
            }

            const channelName = ((msg.channel) as TextChannel).name;
            const channelID = msg.channel.id;

            const userNick = (msg.member.nick) ? msg.member.nick : '';
            const userName = msg.member.user.username;
            const userID = msg.member.user.id;

            const messageContent = msg.content;
            // const message = `${msg.author.username : ${(msg.content)}`;
            messageContent.split('\n').forEach(content => {
                this.logger.info(`${userNick}[${userName}, ${userID}] => ${channelName} (${channelID}): ${content}`);
            });
        });

        this.registerCommand();
    }

    private async registerCommand() {
        this.bot.registerCommand('join', this.commandJoin.bind(this), {
            description: 'Make bot join your channel.',
            guildOnly: true,
        });
        this.bot.registerCommand('leave', this.commandLeave.bind(this), {
            description: 'Make bot leave channel.',
            guildOnly: true,
        });
        this.bot.registerCommand('setvlog', this.commandsetVlog.bind(this), {
            description: 'Set and enable voiceLog',
            guildOnly: true,
            usage: '[lang]',
        });
        this.bot.registerCommand('setlang', this.commandLang.bind(this), {
            argsRequired: true,
            description: 'Set voiceLog language',
            guildOnly: true,
            usage: '<lang>',
        });
        this.bot.registerCommand('unsetvlog', this.commandUnsetVlog.bind(this), {
            description: 'Disable voiceLog',
            guildOnly: true
        });
        this.bot.registerCommand('refreshcache', this.commandRefreshCache.bind(this), {
            description: 'Download and cache all tts file',
            guildOnly: true
        });
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

    private async commandJoin(msg: Message) {
        if (!msg.member) return;

        let data = await this.data.get(msg.member.guild.id);
        if (!data) data = await this.data.create(msg.member.guild.id);
        if (!data) throw ERR_INSERT_FAILURE;

        if (!(msg.member.permissions.has('manageMessages')) && !(this.config.admins.includes(msg.member.id))) {
            msg.channel.createMessage(this.genErrorMessage(this.lang.get(data.lang).display.command.no_permission));
            return;
        }

        const channelID = msg.member.voiceState.channelID;
        if (channelID) {
            const voiceID = this.bot.voiceConnections.get(msg.member.guild.id)?.channelID;
            const voice = voiceID ? this.audios[voiceID] : undefined;
            if (voice && voiceID) {
                if (voice.isReady()) {
                    if (voiceID === channelID) {
                        msg.channel.createMessage(this.genNotChangedMessage(this.lang.get(data.lang).display.command.already_connected));
                    } else {
                        voice.switchChannel(channelID);
                        this.audios[channelID] = voice;
                        delete this.audios[voiceID];
                        this.data.updateLastVoiceChannel(msg.member.guild.id, '');
                        this.data.updateCurrentVoiceChannel(msg.member.guild.id, channelID);
                        voice.playMoved();
                    }
                } else {
                    voice.destroy();
                    delete this.audios[voiceID];
                    this.audios[channelID] = new DiscordVoice(this.bot, this.logger, this.ttsHelper, channelID);
                    this.data.updateLastVoiceChannel(msg.member.guild.id, '');
                    this.data.updateCurrentVoiceChannel(msg.member.guild.id, channelID);
                    this.audios[channelID].playReady();
                }
            } else {
                this.audios[channelID] = new DiscordVoice(this.bot, this.logger, this.ttsHelper, channelID);
                this.data.updateLastVoiceChannel(msg.member.guild.id, '');
                this.data.updateCurrentVoiceChannel(msg.member.guild.id, channelID);
                this.audios[channelID].playReady();
            }
        } else {
            msg.channel.createMessage(this.genErrorMessage(this.lang.get(data.lang).display.command.not_in_channel));
        }
    }

    private async commandLeave(msg: Message) {
        if (!msg.member) return;

        let data = await this.data.get(msg.member.guild.id);
        if (!data) data = await this.data.create(msg.member.guild.id);
        if (!data) throw ERR_INSERT_FAILURE;

        const voiceID = this.bot.voiceConnections.get(msg.member.guild.id)?.channelID;
        const voice = voiceID ? this.audios[voiceID] : undefined;

        if (!(msg.member.permissions.has('manageMessages')) && !(this.config.admins.includes(msg.member.id))) {
            msg.channel.createMessage(this.genErrorMessage(this.lang.get(data.lang).display.command.no_permission));
            return;
        }

        if (voiceID && voice) {
            voice.destroy();
            this.data.updateLastVoiceChannel(msg.member.guild.id, '');
            this.data.updateCurrentVoiceChannel(msg.member.guild.id, '');
            delete this.audios[voiceID];
        }
    }

    private async commandsetVlog(msg: Message, args: string[]) {
        if (!msg.member) return;

        let data = await this.data.get(msg.member.guild.id);
        if (!data) data = await this.data.create(msg.member.guild.id);
        if (!data) throw ERR_INSERT_FAILURE;

        if (!(msg.member.permissions.has('manageMessages')) && !(this.config.admins.includes(msg.member.id))) {
            msg.channel.createMessage(this.genErrorMessage(this.lang.get(data.lang).display.command.no_permission));
            return;
        }

        if (args.length === 0) {
            if (data.channelID === msg.channel.id) {
                msg.channel.createMessage(this.genNotChangedMessage(this.lang.get(data.lang).display.config.exist));
            } else {
                this.data.updateChannel(msg.member.guild.id, msg.channel.id);
                msg.channel.createMessage(this.genSuccessMessage(this.lang.get(data.lang).display.config.success));
            }
        } else {
            let newLang = args[0];
            if (!this.lang.isExist(newLang)) {
                msg.channel.createMessage(this.genErrorMessage(ERR_MISSING_LANG_DEFAULT));
                newLang = data.lang;
            }
            if (data.channelID === msg.channel.id && data.lang === newLang) {
                msg.channel.createMessage(this.genNotChangedMessage(this.lang.get(data.lang).display.config.exist));
            } else {
                if (data.channelID === msg.channel.id) {
                    this.data.updateLang(msg.member.guild.id, newLang);
                    msg.channel.createMessage(
                        this.genSuccessMessage(
                            vsprintf(
                                this.lang.get(newLang).display.config.lang_success,
                                [this.lang.get(newLang).displayName]
                            )
                        )
                    );
                    msg.channel.createMessage(this.genNotChangedMessage(this.lang.get(newLang).display.config.exist));
                } else {
                    this.data.updateChannel(msg.member.guild.id, msg.channel.id);
                    this.data.updateLang(msg.member.guild.id, newLang);
                    msg.channel.createMessage(this.genSuccessMessage(this.lang.get(newLang).display.config.success));
                }
            }
        }
    }

    private async commandLang(msg: Message, args: string[]) {
        if (!msg.member) return;

        let data = await this.data.get(msg.member.guild.id);
        if (!data) data = await this.data.create(msg.member.guild.id);
        if (!data) throw ERR_INSERT_FAILURE;

        if (!(msg.member.permissions.has('manageMessages')) && !(this.config.admins.includes(msg.member.id))) {
            msg.channel.createMessage(this.genErrorMessage(this.lang.get(data.lang).display.command.no_permission));
            return;
        }

        const newLang = args[0];
        if (!this.lang.isExist(newLang)) {
            msg.channel.createMessage(this.genErrorMessage(ERR_MISSING_LANG));
        } else {
            if (data.lang === newLang) {
                msg.channel.createMessage(
                    this.genNotChangedMessage(
                        vsprintf(
                            this.lang.get(data.lang).display.config.lang_exist,
                            [this.lang.get(data.lang).displayName]
                        )
                    )
                );
            } else {
                this.data.updateLang(msg.member.guild.id, newLang);
                msg.channel.createMessage(
                    this.genSuccessMessage(
                        vsprintf(
                            this.lang.get(newLang).display.config.lang_success,
                            [this.lang.get(newLang).displayName]
                        )
                    )
                );
            }
        }
    }

    private async commandUnsetVlog(msg: Message) {
        if (!msg.member) return;

        let data = await this.data.get(msg.member.guild.id);
        if (!data) data = await this.data.create(msg.member.guild.id);
        if (!data) throw ERR_INSERT_FAILURE;

        if (!(msg.member.permissions.has('manageMessages')) && !(this.config.admins.includes(msg.member.id))) {
            msg.channel.createMessage(this.genErrorMessage(this.lang.get(data.lang).display.command.no_permission));
            return;
        }

        this.data.updateChannel(msg.member.guild.id, '');
        msg.channel.createMessage(this.genSuccessMessage(this.lang.get(data.lang).display.config.unset_success));
    }

    private async commandRefreshCache(msg: Message) {
        if (!msg.member) return;

        let data = await this.data.get(msg.member.guild.id);
        if (!data) data = await this.data.create(msg.member.guild.id);
        if (!data) throw ERR_INSERT_FAILURE;

        if (!(this.config.admins.includes(msg.member.id))) {
            msg.channel.createMessage(this.genErrorMessage(this.lang.get(data.lang).display.command.no_permission));
            return;
        }

        this.voiceLog.refreshCache(msg.channel.id);
    }
}
