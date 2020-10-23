import fs from 'fs';
import { resolve } from 'path';
import { Category } from 'typescript-logging';
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
            this.write(true);
            this.logger.info('Fill your config and try again.');
            process.exit(-1);
        }

    }

    private write(firstGenerate: boolean = false) {
        if (firstGenerate) {
            const jsonNew = {
                TOKEN: this.TOKEN,
                googleAPIKey: this.googleAPIKey,
                admins: this.admins,
                database: this.database,
                Debug: this.debug
            };
            const jsonString = JSON.stringify(jsonNew, null, 4);
            if (fs.existsSync('./config.json')) {
                const config = require(resolve('./config.json'));
                if (config === jsonNew) return;
            }
            this.logger.info('Detected first generation, dumping if you needed (e.g. running in docker).');
            console.log(jsonString);
            fs.writeFileSync('./config.json', jsonString, 'utf8');
            return;
        }
        this.canWrite('./config.json', (isWritable: boolean) => {
            const jsonNew = {
                TOKEN: this.TOKEN,
                googleAPIKey: this.googleAPIKey,
                admins: this.admins,
                database: this.database,
                Debug: this.debug
            };
            const jsonString = JSON.stringify(jsonNew, null, 4);
            if (fs.existsSync('./config.json')) {
                const config = require(resolve('./config.json'));
                if (config === jsonNew) return;
            }

            if (isWritable) {
                fs.writeFileSync('./config.json', jsonString, 'utf8');
            } else {
                this.logger.warn('Detected read-only config.json, created an alt file config.json.new and you need to merge it manually.');
                fs.writeFileSync('./config.json.new', jsonString, 'utf8');
            }
        });
    }

    private canWrite(path: string, callback: (isWritable: boolean) => void ) {
        fs.access(path, fs.constants.W_OK, err => {
            callback(!err);
        });
    }
}
