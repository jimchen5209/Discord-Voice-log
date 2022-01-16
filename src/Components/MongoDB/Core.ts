import { EventEmitter } from 'events';
import { Logger } from 'tslog-helper';
import { Db, MongoClient } from 'mongodb';
import { Core } from '../..';

export const ERR_DB_NOT_INIT = Error('Database is not initialized');
export const ERR_INSERT_FAILURE = Error('Data insert failed.');

// tslint:disable-next-line:interface-name
export declare interface MongoDB {
    on(event: 'connect', listen: (database: Db) => void): this;
}

export class MongoDB extends EventEmitter {
    private _client?: Db;
    private logger: Logger;

    constructor(core: Core) {
        super();

        this.logger = core.mainLogger.getChildLogger({ name: 'MongoDB'});
        this.logger.info('Loading MongoDB...');

        const config = core.config.mongodb;

        MongoClient.connect(config.host).then(client => {
            this.logger.info('Successfully connected to mongoDB');

            this._client = client.db(config.name);

            this.emit('connect', this._client);
        });
    }

    public get client() {
        return this._client;
    }
}
