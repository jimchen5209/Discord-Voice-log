import { Client } from 'eris';
import { Category } from 'logging-ts';
import { AnyRequestData, GatewayServer, SlashCommand, SlashCreator } from 'slash-create';
import { Core } from '../../..';
import { Config } from '../../../Core/Config';
import { Lang } from '../../../Core/Lang';
import { Discord } from '../Core';
import { JoinCommand } from './Commands/Join';
import { LeaveCommand } from './Commands/Leave';
import { RefreshCacheCommand } from './Commands/RefreshCache';
import { SetLanguageCommand } from './Commands/SetLanguage';
import { SetVoiceLogCommand } from './Commands/SetVoiceLog';
import { UnSetVoiceLogCommand } from './Commands/UnSetVoiceLog';
import { VoiceLog } from './VoiceLog';

export class Command {
    private config: Config;
    private bot: Client;
    private creator: SlashCreator;
    private logger: Category;
    private voiceLog: VoiceLog;
    private lang: Lang;

    constructor(voiceLog: VoiceLog, core: Core, discord: Discord, bot: Client) {
        this.config = core.config;
        this.bot = bot;
        this.logger = new Category('Command', core.mainLogger);
        this.voiceLog = voiceLog;
        this.lang = discord.lang;

        this.creator = new SlashCreator({
            applicationID: this.config.discord.applicationID,
            publicKey: this.config.discord.publicKey,
            token: this.config.discord.botToken
        });

        this.creator
            .withServer(
                new GatewayServer(
                    (handler) => this.bot.on('rawWS', event => {
                        if (event.t === 'INTERACTION_CREATE') handler(event.d as AnyRequestData);
                    })
                )
            );
    }

    public refreshCommands() {
        this.logger.info('Refreshing commands to all guilds...');

        this.bot.getRESTGuilds({ limit: 200 }).then(value => {
            const guildIDs: string[] = [];

            value.forEach(value => { guildIDs.push(value.id); });

            const commands: SlashCommand[] = [
                new JoinCommand(this.creator, guildIDs, this.voiceLog),
                new LeaveCommand(this.creator, guildIDs, this.voiceLog),
                new SetVoiceLogCommand(this.creator, guildIDs, this.lang, this.voiceLog),
                new SetLanguageCommand(this.creator, guildIDs, this.lang, this.voiceLog),
                new UnSetVoiceLogCommand(this.creator, guildIDs, this.voiceLog),
                new RefreshCacheCommand(this.creator, guildIDs, this.voiceLog),
            ];

            this.creator.registerCommands(commands);
            this.creator.syncCommands();
        });
    }
}