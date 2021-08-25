import { existsSync, readFileSync, writeFileSync } from 'fs';
import { Category } from 'logging-ts';
import { Core } from '..';

export class Config {
    private configVersion = 2;
    public discord: { botToken: string, applicationID: string, publicKey: string, admins: string[] };
    public googleTTS: { apiKey: string };
    public mongodb: { host: string, name: string };
    public debug: boolean;
    private logger: Category;

    constructor(core: Core) {
        this.logger = new Category('Config', core.mainLogger);
        this.logger.info('Loading Config...');

        const discordDefault = { botToken: '', applicationID: '', publicKey: '', admins: [] };
        const googleTTSDefault = { apiKey: '' };
        const mongodbDefault = { host: 'mongodb://localhost:27017', name: 'VoiceLog' };

        let versionChanged = false;

        if (existsSync('./config.json')) {
            const config = JSON.parse(readFileSync('config.json', { encoding: 'utf-8' }));

            if (!config.configVersion || config.configVersion < this.configVersion) versionChanged = true;
            if (config.configVersion > this.configVersion) {
                this.logger.fatal('This config version is newer than me! Consider upgrading to the latest version or reset your configuration.', null);
                process.exit(1);
            }

            // read and migrate config
            if (!config.discord) config.discord = {};
            this.discord = {
                botToken: (config.discord.botToken) ? config.discord.botToken : ((config.TOKEN) ? config.TOKEN : discordDefault.botToken),
                applicationID: (config.discord.applicationID) ? config.discord.applicationID : discordDefault.applicationID,
                publicKey: (config.discord.publicKey) ? config.discord.publicKey : discordDefault.publicKey,
                admins: (config.discord.admins) ? config.discord.admins : ((config.admins) ? config.admins : discordDefault.admins)
            };

            if (!config.googleTTS) config.googleTTS = {};
            this.googleTTS = {
                apiKey: (config.googleTTS.apiKey) ? config.googleTTS.apiKey : ((config.googleAPIKey) ? config.googleAPIKey : googleTTSDefault.apiKey)
            };

            if (!config.mongodb) config.mongodb = {};
            this.mongodb = {
                host: (config.mongodb.host) ? config.mongodb.host : ((config.database.host) ? config.database.host : mongodbDefault.host),
                name: (config.mongodb.name) ? config.mongodb.name : ((config.database.name) ? config.database.name : mongodbDefault.name)
            };

            this.debug = (config.debug) ? config.debug : ((config.Debug) ? config.Debug : false);

            this.write();

            if (versionChanged) {
                this.logger.info('Detected config version change and we have tried to migrate into it! Consider checking your config file.');
                process.exit(1);
            }
        } else {
            this.logger.fatal('Can\'t load config.json: File not found.', null);
            this.logger.info('Generating empty config...');
            this.discord = discordDefault;
            this.googleTTS = googleTTSDefault;
            this.mongodb = mongodbDefault;
            this.debug = false;
            this.write();
            this.logger.info('Fill your config and try again.');
            process.exit(1);
        }

    }

    private write() {
        const json = JSON.stringify({
            configVersion: this.configVersion,
            discord: this.discord,
            googleTTS: this.googleTTS,
            mongodb: this.mongodb,
            debug: this.debug
        }, null, 4);
        writeFileSync('./config.json', json, 'utf8');
    }
}
