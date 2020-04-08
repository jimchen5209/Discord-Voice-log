import fs from 'fs';
import { Collection, ObjectID } from 'mongodb';
import { resolve } from 'path';
import { Core } from '..';
import { ERR_DB_NOT_INIT } from './MongoDB';

export interface IServerConfig {
    _id: ObjectID;
    serverID: string;
    lang: string;
    channelID: string;
    lastVoiceChannel: string;
}

export class ServerConfigManager {
    private database?: Collection<IServerConfig>;
    // private cache: { [key: string]: IServerConfig } = {};

    constructor(core: Core) {
        core.on('ready', async () => {
            if (!core.database.client) throw Error('Database client not init');
            this.database = core.database.client.collection('serverConfig');
            this.database.createIndex({ serverID: 1 });
            if (fs.existsSync('./vlogdata.json')) {
                core.mainLogger.info('Old data found. Migrating to db...');
                const dataRaw = require(resolve('./vlogdata.json'));
                for (const key of Object.keys(dataRaw)) {
                    if (dataRaw[key] === undefined) continue;
                    await this.create(key, dataRaw[key].channel, dataRaw[key].lang, dataRaw[key].lastVoiceChannel);
                }
                fs.renameSync('./vlogdata.json', './vlogdata.json.bak');
            }
        });
    }

    public async create(serverID: string, channelID: string = '', lang: string = 'en_US', lastVoiceChannel: string = '') {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return (await this.database.insertOne({
            serverID,
            channelID,
            lang,
            lastVoiceChannel
        } as IServerConfig)).ops[0] as IServerConfig;
    }

    public get(serverID: string) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.findOne({ serverID });
    }

    public async updateChannel(serverID: string, channelID: string) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return (await this.database.findOneAndUpdate(
            { serverID },
            { $set: { channelID } },
            { returnOriginal: false }
        )).value;
    }

    public async updateLang(serverID: string, lang: string) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return (await this.database.findOneAndUpdate(
            { serverID },
            { $set: { lang } },
            { returnOriginal: false }
        )).value;
    }

    public async updateLastVoiceChannel(serverID: string, lastVoiceChannel: string) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return (await this.database.findOneAndUpdate(
            { serverID },
            { $set: { lastVoiceChannel } },
            { returnOriginal: false }
        )).value;
    }
}
