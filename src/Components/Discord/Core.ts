import { CommandClient } from 'eris';
import { Category } from 'logging-ts';
import { Core } from '../..';
import { Config } from '../../Core/Config';
import { Lang } from '../../Core/Lang';
import { TTSHelper } from '../../Core/TTSHelper';
import { DiscordText } from './Components/Text';
import { VoiceLog } from './Components/VoiceLog';

const ERR_MISSING_TOKEN = Error('Discord token missing');

export class Discord {
    private _lang: Lang;
    private _ttsHelper: TTSHelper;
    private _voiceLog: VoiceLog;
    private config: Config;
    private bot: CommandClient;
    private logger: Category;

    constructor(core: Core) {
        this.config = core.config;
        this.logger = new Category('Discord', core.mainLogger);
        this._lang = new Lang(core);
        this._ttsHelper = new TTSHelper(core);

        if (this.config.discord.botToken === '') throw ERR_MISSING_TOKEN;

        this.bot = new CommandClient(
            this.config.discord.botToken,
            { restMode: true },
            { defaultCommandOptions: { caseInsensitive: true } }
        );

        this._voiceLog = new VoiceLog(core, this, this.bot, this.logger);

        process.on('warning', e => {
            this.logger.warn(e.message);
        });

        this.bot.on('ready', async () => {
            this.logger.info(`Logged in as ${this.bot.user.username} (${this.bot.user.id})`);
            this._voiceLog.start();
        });

        // tslint:disable-next-line:no-unused-expression
        new DiscordText(core, this, this.bot, this.logger);

        this.bot.connect();
    }

    public get lang() {
        return this._lang;
    }

    public get ttsHelper() {
        return this._ttsHelper;
    }

    public get voiceLog() {
        return this._voiceLog;
    }

}
