import { EventEmitter } from 'events';
import { Db, MongoClient } from 'mongodb';
import { Category } from 'typescript-logging';
import { Core } from '..';

export const ERR_DB_NOT_INIT = Error('Database is not initialized');

// tslint:disable-next-line:interface-name
export declare interface MongoDB {
    on(event: 'connect', listen: (database: Db) => void): this;
}

export class MongoDB extends EventEmitter {
    public client?: Db;
    private logger: Category;

    constructor(core: Core) {
        super();

        this.logger = new Category('MongoDB', core.mainLogger);
        this.logger.info('Loading MongoDB...');

        const config = core.config.database;

        MongoClient.connect(config.host, { useNewUrlParser: true }).then(client => {
            this.logger.info(`Successfully connected to MongoDB`);

            this.client = client.db(config.name);

            this.emit('connect', this.client);
        });
    }
}
