import { EventEmitter } from 'events';
import { catService } from 'logging-ts';
import { Discord } from './Components/Discord/Core';
import { Config } from './Core/Config';
import { MongoDB } from './Components/MongoDB/Core';
import { ServerConfigManager } from './Components/MongoDB/db/ServerConfig';
import { Status }from 'status-client';
import { PluginManager } from './Components/Plugin/Core';
import { TTSHelper } from './Core/TTSHelper';
import { Lang } from './Core/Lang';

export class Core extends EventEmitter {
    public readonly mainLogger = catService;
    public readonly config = new Config(this);
    public readonly database = new MongoDB(this);
    public readonly data = new ServerConfigManager(this);
    public readonly ttsHelper = new TTSHelper(this);
    public readonly lang = new Lang(this);
    public readonly plugins = new PluginManager(this);
    private readonly status = new Status('VoiceLog');
    constructor() {
        super();
        this.mainLogger.info('Starting...');

        this.emit('init', this);

        // Wait DB connect
        this.database.on('connect', () => this.emit('ready'));
        this.on('ready', async () => {
            try {
                // tslint:disable-next-line:no-unused-expression
                new Discord(this);
            } catch (error) {
                console.error(error);
            }
            // tslint:disable-next-line:no-unused-expression
            this.status.set_status();
        });
    }
}

// tslint:disable-next-line:no-unused-expression
new Core();
