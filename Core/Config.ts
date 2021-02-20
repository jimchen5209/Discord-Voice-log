import fs from 'fs';
import { Category } from 'logging-ts';
import { resolve } from 'path';
import { Core } from '..';

export class Config {
    public TOKEN: string;
    public googleAPIKey: string;
    public admins: string[];
    public debug: boolean;
    public database: { host: string, name: string };
    private logger: Category;

    constructor(core: Core) {
        this.logger = new Category('Config', core.mainLogger);
        this.logger.info('Loading Config...');
        if (fs.existsSync('./config.json')) {
            const config = require(resolve('./config.json'));
            this.TOKEN = (config.TOKEN) ? config.TOKEN : '';
            this.googleAPIKey = (config.googleAPIKey) ? config.googleAPIKey : '';
            this.admins = (config.admins) ? config.admins : [];
            this.debug = (config.Debug) ? config.Debug : false;
            this.database = (config.database) ? config.database : { host: 'mongodb://localhost:27017', name: 'VoiceLog' };
            this.write();
        } else {
            this.logger.error('Can\'t load config.json: File not found.', null);
            this.logger.info('Generating empty config...');
            this.TOKEN = '';
            this.googleAPIKey = '';
            this.admins = [];
            this.debug = false;
            this.database = { host: 'mongodb://localhost:27017', name: 'VoiceLog' };
            this.write();
            this.logger.info('Fill your config and try again.');
            process.exit(-1);
        }

    }

    private write() {
        const json = JSON.stringify({
            TOKEN: this.TOKEN,
            googleAPIKey: this.googleAPIKey,
            admins: this.admins,
            database: this.database,
            Debug: this.debug
        }, null, 4);
        fs.writeFileSync('./config.json', json, 'utf8');
    }
}
