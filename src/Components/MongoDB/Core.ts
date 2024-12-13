import { EventEmitter } from 'events'
import { Logger } from 'tslog-helper'
import { Db, MongoClient } from 'mongodb'
import { Core } from '../..'

export const ERR_DB_NOT_INIT = Error('Database is not initialized')
export const ERR_INSERT_FAILURE = Error('Data insert failed.')

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, no-unused-vars -- definition*/
export declare interface MongoDB {
  on(event: 'connect', listen: (database: Db) => void): this;
  on(event: 'error', listen: (error: Error) => void): this;
}
/* eslint-enable @typescript-eslint/no-unsafe-declaration-merging, no-unused-vars */

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- definition
export class MongoDB extends EventEmitter {
  private _client?: Db
  private logger: Logger

  constructor(core: Core) {
    super()

    this.logger = core.mainLogger.getChildLogger({ name: 'MongoDB' })
    this.logger.info('Loading MongoDB...')

    const config = core.config.mongodb

    let connectTryCount = 0
    const maxConnectTryCount = 5
    const tryConnect = () => {
      this.logger.info('Trying to connect to mongoDB...')
      MongoClient.connect(config.host)
        .then(client => {
          this.logger.info('Successfully connected to mongoDB')

          this._client = client.db(config.name)

          this.emit('connect', this._client)
        })
        .catch((reason) => {
          this.logger.error(`Failed to connect to mongoDB: ${reason}`)
          connectTryCount++
          if (connectTryCount > maxConnectTryCount) {
            this.logger.error('Unable to connect to mongoDB.')
            this.emit('error', reason)
          }
          this.logger.warn(`Retrying to in 5 seconds... (try ${connectTryCount} / ${maxConnectTryCount} )`)
          setTimeout(tryConnect, 5 * 1000)
        })
    }

    tryConnect()
  }

  public get client() {
    return this._client
  }
}
