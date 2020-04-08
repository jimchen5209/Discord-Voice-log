import { CommandClient, Member, Message, MessageContent, TextChannel, VoiceChannel, VoiceConnection } from 'eris';
import FFmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import moment from 'moment';
import Queue from 'promise-queue';
import { vsprintf } from 'sprintf-js';
import { Category } from 'typescript-logging';
import { Core } from '..';
import { Config } from '../Core/Config';
import { Lang } from '../Core/Lang';
import { ServerConfigManager } from '../Core/ServerConfigManager';

const ERR_MISSING_TOKEN = Error('Discord token missing');
const ERR_MISSING_LANG = 'Language not exist.';
const ERR_MISSING_LANG_DEFAULT = 'Language not exist, will not change your language.';
const ttsURL = 'https://translate.google.com.tw/translate_tts?ie=UTF-8&q="%1s"&tl=%2s&client=tw-ob';

export class Discord {
    private config: Config;
    private bot: CommandClient;
    private data: ServerConfigManager;
    private logger: Category;
    private lang: Lang;
    private queue = new Queue(1, Infinity);

    constructor(core: Core) {
        this.config = core.config;
        this.logger = new Category('Discord', core.mainLogger);
        this.data = core.data;
        this.lang = new Lang(core);

        if (this.config.TOKEN === '') throw ERR_MISSING_TOKEN;

        this.bot = new CommandClient(
            this.config.TOKEN,
            { restMode: true },
            { defaultCommandOptions: { caseInsensitive: true } }
        );

        process.on('warning', e => {
            this.logger.warn(e.message);
        });

        this.bot.on('ready', async () => {
            this.logger.info(`Logged in as ${this.bot.user.username} (${this.bot.user.id})`);
            if (!fs.existsSync('./assets')) fs.mkdirSync('./assets');
            const channels = await this.data.getCurrentChannels();
            channels.forEach(element => {
                this.logger.info(`Reconnecting to ${element.currentVoiceChannel}...`);
                this.joinVoiceChannel(element.currentVoiceChannel);
            });
        });

        this.bot.on('voiceChannelJoin', async (member: Member, newChannel: VoiceChannel) => {
            if (member.id === this.bot.user.id) return;
            await this.autoLeaveChannel(undefined, newChannel, member.guild.id);
            const voice = this.bot.voiceConnections.get(member.guild.id);
            const data = await this.data.get(member.guild.id);

            if (data) {
                if (data.channelID !== '') {
                    this.bot.createMessage(data.channelID, this.genVoiceLogEmbed(member, data.lang, 'join', undefined, newChannel));
                }
            }

            if (voice && voice.ready) {
                if (newChannel.id === voice.channelID) {
                    this.playVoice(member, voice, 'join');
                }
            }
            voice?.setMaxListeners(0);
        });

        this.bot.on('voiceChannelLeave', async (member: Member, oldChannel: VoiceChannel) => {
            if (member.id === this.bot.user.id) return;
            await this.autoLeaveChannel(oldChannel, undefined, member.guild.id);
            const voice = this.bot.voiceConnections.get(member.guild.id);
            const data = await this.data.get(member.guild.id);
            if (data) {
                if (data.channelID !== '') {
                    this.bot.createMessage(data.channelID, this.genVoiceLogEmbed(member, data.lang, 'leave', oldChannel, undefined));
                }
            }
            if (voice && voice.ready) {
                if (oldChannel.id === voice.channelID) {
                    this.playVoice(member, voice, 'left');
                }
            }
        });

        this.bot.on('voiceChannelSwitch', async (member: Member, newChannel: VoiceChannel, oldChannel: VoiceChannel) => {
            if (member.id === this.bot.user.id) return;
            await this.autoLeaveChannel(oldChannel, newChannel, member.guild.id);
            const voice = this.bot.voiceConnections.get(member.guild.id);
            const data = await this.data.get(member.guild.id);

            if (data) {
                if (data.channelID !== '') {
                    this.bot.createMessage(data.channelID, this.genVoiceLogEmbed(member, data.lang, 'move', oldChannel, newChannel));
                }
            }
            if (voice && voice.ready) {
                if (oldChannel.id === voice.channelID) {
                    this.playVoice(member, voice, 'switched_out');
                }
                if (newChannel.id === voice.channelID) {
                    this.playVoice(member, voice, 'switched_in');
                }
            }
        });

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

        this.bot.connect();
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
    }

    private async commandJoin(msg: Message) {
        if (!msg.member) return;

        let data = await this.data.get(msg.member.guild.id);
        if (!data) data = await this.data.create(msg.member.guild.id);

        if (!(msg.member.permission.has('manageMessages')) && !(this.config.admins.includes(msg.member.id))) {
            msg.channel.createMessage(this.lang.get(data.lang).display.command.no_permission);
            return;
        }

        const channelID = msg.member.voiceState.channelID;
        if (channelID) {
            const voice = this.bot.voiceConnections.get(msg.member.guild.id);
            if (voice) {
                if (voice.ready) {
                    if (voice.channelID === channelID) {
                        msg.channel.createMessage(this.lang.get(data.lang).display.command.already_connected);
                    } else {
                        voice.switchChannel(channelID);
                        const voiceFile = vsprintf(ttsURL, ['VoiceLog TTS is moved to your channel.', 'en-GB']).replace(/ /gi, '%20');
                        this.queue.add(() => this.play(voiceFile, voice));
                    }
                } else {
                    this.bot.leaveVoiceChannel(channelID);
                    const connection = await this.joinVoiceChannel(channelID);
                    this.data.updateLastVoiceChannel(msg.member.guild.id, '');
                    this.data.updateCurrentVoiceChannel(msg.member.guild.id, channelID);
                    const voiceFile = vsprintf(ttsURL, ['VoiceLog TTS is ready.', 'en-GB']).replace(/ /gi, '%20');
                    this.queue.add(() => this.play(voiceFile, connection));
                }
            } else {
                const connection = await this.joinVoiceChannel(channelID);
                this.data.updateLastVoiceChannel(msg.member.guild.id, '');
                this.data.updateCurrentVoiceChannel(msg.member.guild.id, channelID);
                const voiceFile = vsprintf(ttsURL, ['VoiceLog TTS is ready.', 'en-GB']).replace(/ /gi, '%20');
                this.queue.add(() => this.play(voiceFile, connection));
            }
        } else {
            msg.channel.createMessage(this.lang.get(data.lang).display.command.not_in_channel);
        }
    }

    private async commandLeave(msg: Message) {
        if (!msg.member) return;

        let data = await this.data.get(msg.member.guild.id);
        if (!data) data = await this.data.create(msg.member.guild.id);

        const voice = this.bot.voiceConnections.get(msg.member.guild.id);

        if (!(msg.member.permission.has('manageMessages')) && !(this.config.admins.includes(msg.member.id))) {
            msg.channel.createMessage(this.lang.get(data.lang).display.command.no_permission);
            return;
        }

        if (voice) this.bot.leaveVoiceChannel(voice.channelID);
    }

    private async commandsetVlog(msg: Message, args: string[]) {
        if (!msg.member) return;

        let data = await this.data.get(msg.member.guild.id);
        if (!data) data = await this.data.create(msg.member.guild.id);

        if (!(msg.member.permission.has('manageMessages')) && !(this.config.admins.includes(msg.member.id))) {
            msg.channel.createMessage(this.lang.get(data.lang).display.command.no_permission);
            return;
        }

        if (args.length === 0) {
            if (data.channelID === msg.channel.id) {
                msg.channel.createMessage(this.lang.get(data.lang).display.config.exist);
            } else {
                this.data.updateChannel(msg.member.guild.id, msg.channel.id);
                msg.channel.createMessage(this.lang.get(data.lang).display.config.success);
            }
        } else {
            let newLang = args[0];
            if (!this.lang.isExist(newLang)) {
                msg.channel.createMessage(ERR_MISSING_LANG_DEFAULT);
                newLang = data.lang;
            }
            if (data.channelID === msg.channel.id && data.lang === newLang) {
                msg.channel.createMessage(this.lang.get(data.lang).display.config.exist);
            } else {
                if (data.channelID === msg.channel.id) {
                    this.data.updateLang(msg.member.guild.id, newLang);
                    msg.channel.createMessage(
                        vsprintf(
                            this.lang.get(newLang).display.config.lang_success,
                            [this.lang.get(newLang).displayName]
                        )
                    );
                    msg.channel.createMessage(this.lang.get(newLang).display.config.exist);
                } else {
                    this.data.updateChannel(msg.member.guild.id, msg.channel.id);
                    this.data.updateLang(msg.member.guild.id, newLang);
                    msg.channel.createMessage(this.lang.get(newLang).display.config.success);
                }
            }
        }
    }

    private async commandLang(msg: Message, args: string[]) {
        if (!msg.member) return;

        let data = await this.data.get(msg.member.guild.id);
        if (!data) data = await this.data.create(msg.member.guild.id);

        if (!(msg.member.permission.has('manageMessages')) && !(this.config.admins.includes(msg.member.id))) {
            msg.channel.createMessage(this.lang.get(data.lang).display.command.no_permission);
            return;
        }

        const newLang = args[0];
        if (!this.lang.isExist(newLang)) {
            msg.channel.createMessage(ERR_MISSING_LANG);
        } else {
            if (data.lang === newLang) {
                msg.channel.createMessage(
                    vsprintf(
                        this.lang.get(data.lang).display.config.lang_exist,
                        [this.lang.get(data.lang).displayName]
                    ));
            } else {
                this.data.updateLang(msg.member.guild.id, newLang);
                msg.channel.createMessage(
                    vsprintf(
                        this.lang.get(newLang).display.config.lang_success,
                        [this.lang.get(newLang).displayName]
                    )
                );
            }
        }
    }

    private genVoiceLogEmbed(member: Member, lang: string, type: string, oldChannel: VoiceChannel | undefined, newChannel: VoiceChannel | undefined) {
        let color: number;
        let content: string;
        switch (type) {
            case 'join':
                color = 4289797;
                content = vsprintf(this.lang.get(lang).display.voice_log.joined, [newChannel!.name]);
                break;
            case 'leave':
                color = 8454161;
                content = vsprintf(this.lang.get(lang).display.voice_log.left, [oldChannel!.name]);
                break;
            case 'move':
                color = 10448150;
                content = vsprintf('%0s ▶️ %1s', [oldChannel!.name, newChannel!.name]);
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

    private async playVoice(member: Member, voice: VoiceConnection, type: string) {
        let voiceFile = '';
        if (fs.existsSync(`assets/${member.id}.json`)) {
            const tts = JSON.parse(fs.readFileSync(`assets/${member.id}.json`, { encoding: 'utf-8' }));
            if (tts.lang && tts[type]) {
                voiceFile = vsprintf(ttsURL, [tts[type], tts.lang]).replace(/ /gi, '%20');
            } else if (fs.existsSync(`assets/${member.id}_${type}.wav`)) {
                voiceFile = `assets/${member.id}_${type}.wav`;
            }
        } else if (fs.existsSync(`assets/${member.id}_${type}.wav`)) {
            voiceFile = `assets/${member.id}_${type}.wav`;
        }
        if (voiceFile !== '') this.queue.add(() => this.play(voiceFile, voice));
    }

    private async joinVoiceChannel(channelID: string): Promise<VoiceConnection> {
        const connection = await this.bot.joinVoiceChannel(channelID);
        connection.on('warn', (message: string) => {
            this.logger.warn(`Warning from ${channelID}: ${message}`);
        });
        const error = (err: Error) => {
            connection.stopPlaying();
            connection.removeAllListeners();
            if (err) {
                this.logger.error(`Error from ${channelID}: ${err.name} ${err.message}`, null);
                setTimeout(() => {
                    this.bot.leaveVoiceChannel(channelID);
                    this.joinVoiceChannel(channelID);
                }, 5000);
            }
        };
        connection.once('error', error);
        connection.once('disconnect', error);
        return connection;
    }

    private play(file: string, voice: VoiceConnection) {
        return new Promise((res, _) => {
            if (file === '') return;
            if (!voice) return;
            if (!voice.ready) return;
            // voice.once('end', () => res());
            FFmpeg.ffprobe(file, (err, data) => {
                voice.play(file);
                const time = data.format.duration || 0;
                setTimeout(() => {
                    voice.stopPlaying();
                    res();
                }, time * 1200);
            });
        });
    }

    private async autoLeaveChannel(oldChannel: VoiceChannel | undefined, newChannel: VoiceChannel | undefined, serverID: string) {
        let channelToCheck: VoiceChannel | undefined;

        const voice = this.bot.voiceConnections.get(serverID);
        const data = await this.data.get(serverID);

        if (voice && voice.ready) {
            channelToCheck = (oldChannel?.id === voice.channelID) ? oldChannel : (newChannel?.id === voice.channelID) ? newChannel : undefined;
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
                this.data.updateLastVoiceChannel(serverID, channelToCheck.id);
                this.data.updateCurrentVoiceChannel(serverID, '');
                this.bot.leaveVoiceChannel(channelToCheck.id);
            }
        } else {
            if (!voice) {
                await this.joinVoiceChannel(channelToCheck.id);
                this.data.updateLastVoiceChannel(serverID, '');
                this.data.updateCurrentVoiceChannel(serverID, channelToCheck.id);
            }
        }
    }
}
