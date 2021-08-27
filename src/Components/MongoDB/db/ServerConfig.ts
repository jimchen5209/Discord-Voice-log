import fs, { readFileSync } from 'fs';
import { Collection, ObjectId, ReturnDocument } from 'mongodb';
import { Core } from '../../..';
import { ERR_DB_NOT_INIT, ERR_INSERT_FAILURE } from '../Core';

export interface IServerConfig {
    _id: ObjectId;
    serverID: string;
    lang: string;
    channelID: string;
    lastVoiceChannel: string;
    currentVoiceChannel: string;
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
                const dataRaw = JSON.parse(readFileSync('./vlogdata.json', { encoding: 'utf-8' }));
                for (const key of Object.keys(dataRaw)) {
                    if (dataRaw[key] === undefined) continue;
                    await this.create(key, dataRaw[key].channel, dataRaw[key].lang, dataRaw[key].lastVoiceChannel);
                }
                fs.renameSync('./vlogdata.json', './vlogdata.json.bak');
            }

            // Add field admin to old lists
            this.database.updateMany({ currentVoiceChannel: { $exists: false } }, { $set: { currentVoiceChannel: '' } });
        });
    }

    public async create(serverID: string, channelID = '', lang = 'en_US', lastVoiceChannel = '', currentVoiceChannel = '') {
        if (!this.database) throw ERR_DB_NOT_INIT;

        const data = {
            serverID,
            channelID,
            lang,
            lastVoiceChannel,
            currentVoiceChannel
        } as IServerConfig;

        return (await this.database.insertOne(data)).acknowledged ? data : null;
    }

    public get(serverID: string) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.findOne({ serverID });
    }

    public async getOrCreate(guildId: string) {
        let data = await this.get(guildId);
        if (!data) data = await this.create(guildId);
        if (!data) throw ERR_INSERT_FAILURE;

        return data;
    }

    public getCurrentChannels() {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return this.database.find({ currentVoiceChannel: { $ne: '' } }).toArray();
    }

    public async updateChannel(serverID: string, channelID: string) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return (await this.database.findOneAndUpdate(
            { serverID },
            { $set: { channelID } },
            { returnDocument: ReturnDocument.AFTER }
        )).value;
    }

    public async updateLang(serverID: string, lang: string) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return (await this.database.findOneAndUpdate(
            { serverID },
            { $set: { lang } },
            { returnDocument: ReturnDocument.AFTER }
        )).value;
    }

    public async updateLastVoiceChannel(serverID: string, lastVoiceChannel: string) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return (await this.database.findOneAndUpdate(
            { serverID },
            { $set: { lastVoiceChannel } },
            { returnDocument: ReturnDocument.AFTER }
        )).value;
    }

    public async updateCurrentVoiceChannel(serverID: string, currentVoiceChannel: string) {
        if (!this.database) throw ERR_DB_NOT_INIT;

        return (await this.database.findOneAndUpdate(
            { serverID },
            { $set: { currentVoiceChannel } },
            { returnDocument: ReturnDocument.AFTER }
        )).value;
    }
}
