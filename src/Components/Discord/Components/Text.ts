import { CommandClient, Message, TextChannel } from 'eris';
import { Category } from 'logging-ts';
import { Core } from '../../..';
import { Discord } from '../Core';
import { VoiceLog } from './VoiceLog';

export class DiscordText {
    private voiceLog: VoiceLog;
    private bot: CommandClient;
    private logger: Category;

    constructor(_core: Core, discord: Discord, bot: CommandClient, logger: Category) {
        this.bot = bot;
        this.logger = logger;
        this.voiceLog = discord.voiceLog;

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

    private async commandJoin(msg: Message) {
        await this.voiceLog.command.commandJoin(msg);
    }

    private async commandLeave(msg: Message) {
        await this.voiceLog.command.commandLeave(msg);
    }

    private async commandsetVlog(msg: Message, args: string[]) {
        await this.voiceLog.command.commandsetVlog(msg, args);
    }

    private async commandLang(msg: Message, args: string[]) {
        await this.voiceLog.command.commandLang(msg, args);
    }

    private async commandUnsetVlog(msg: Message) {
        await this.voiceLog.command.commandUnsetVlog(msg);
    }

    private async commandRefreshCache(msg: Message) {
        await this.voiceLog.command.commandRefreshCache(msg);
    }
}

