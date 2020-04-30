import { EventEmitter } from 'events';
import { Discord } from './Components/Discord';
import { Config } from './Core/Config';
import { catService } from './Core/Logger';
import { MongoDB } from './Core/MongoDB';
import { ServerConfigManager } from './Core/ServerConfigManager';

export class Core extends EventEmitter {
    public readonly mainLogger = catService;
    public readonly config = new Config(this);
    public readonly database = new MongoDB(this);
    public readonly data = new ServerConfigManager(this);
    constructor() {
        super();

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
        });
    }
}

// tslint:disable-next-line:no-unused-expression
new Core();
