import { EventEmitter } from 'events'
import { Db, MongoClient, ServerApiVersion } from 'mongodb'
import { DbServerConfigManager } from './db/ServerConfig'
import { instances } from '../../Utils/Instances'

export const ERR_DB_NOT_INIT = Error('Database is not initialized')
export const ERR_INSERT_FAILURE = Error('Data insert failed.')

export class MongoDB extends EventEmitter {
  private client: MongoClient = new MongoClient(instances.config.mongodb.host, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true
    }
  })
  private _db?: Db
  private _serverConfig?: DbServerConfigManager
  private log = instances.mainLogger.getSubLogger({ name: 'MongoDB' })

  constructor() {
    super()

    let connectTryCount = 0
    const maxConnectTryCount = 5
    const tryConnect = () => {
      this.log.info('Trying to connect to mongoDB...')
      this.client
        .connect()
        .then(() => {
          this.log.info('Successfully connected to mongoDB')

          this._db = this.client.db(instances.config.mongodb.name)

          // Initialize collections
          this._serverConfig = new DbServerConfigManager(this._db)

          this.emit('connect', this.client)
        })
        .catch((err) => {
          this.log.error('Failed to connect to mongoDB:', err)

          connectTryCount++
          if (connectTryCount > maxConnectTryCount) {
            this.log.fatal('Unable to connect to mongoDB.')
            this.emit('error')
          }

          this.log.warn(
            `Retrying to in 5 seconds... (try ${connectTryCount} / ${maxConnectTryCount} )`
          )
          setTimeout(tryConnect, 5 * 1000)
        })
    }

    tryConnect()
  }

  public close() {
    this.log.info('Closing mongoDB connection...')
    this.client.close()
  }

  public get serverConfig() {
    if (!this._serverConfig) throw ERR_DB_NOT_INIT

    return this._serverConfig
  }
}
