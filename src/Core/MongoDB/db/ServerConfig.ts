import { existsSync as exists, readFileSync as readFile, renameSync as renameFile } from 'node:fs'
import { type Collection, type Db, type ObjectId, ReturnDocument } from 'mongodb'
import { instances } from '../../../Utils/Instances'
import { ERR_DB_NOT_INIT, ERR_INSERT_FAILURE } from '../Core'

export interface IServerConfig {
  _id: ObjectId
  serverID: string
  lang: string
  channelID: string
  lastVoiceChannel: string
  currentVoiceChannel: string
}

export class DbServerConfigManager {
  private database?: Collection<IServerConfig>

  constructor(db: Db) {
    if (!db) throw Error('Database client not init')

    this.database = db.collection('serverConfig')
    this.database.createIndex({ serverID: 1 })

    this.migrateData()
  }

  private async migrateData() {
    if (exists('./vlogdata.json')) {
      instances.mainLogger.info('Old data found. Migrating to db...')
      const dataRaw = JSON.parse(readFile('./vlogdata.json', { encoding: 'utf-8' }))
      for (const key of Object.keys(dataRaw)) {
        if (dataRaw[key] === undefined) continue
        await this.create(key, dataRaw[key].channel, dataRaw[key].lang, dataRaw[key].lastVoiceChannel)
      }
      renameFile('./vlogdata.json', './vlogdata.json.bak')
    }

    // Add field admin to old lists
    this.database?.updateMany({ currentVoiceChannel: { $exists: false } }, { $set: { currentVoiceChannel: '' } })
  }

  public async create(serverID: string, channelID = '', lang = 'en_US', lastVoiceChannel = '', currentVoiceChannel = '') {
    if (!this.database) throw ERR_DB_NOT_INIT

    const data = {
      serverID,
      channelID,
      lang,
      lastVoiceChannel,
      currentVoiceChannel
    } as IServerConfig

    return (await this.database.insertOne(data)).acknowledged ? data : null
  }

  public get(serverID: string) {
    if (!this.database) throw ERR_DB_NOT_INIT

    return this.database.findOne({ serverID })
  }

  public async getOrCreate(guildId: string) {
    let data = await this.get(guildId)
    if (!data) data = await this.create(guildId)
    if (!data) throw ERR_INSERT_FAILURE

    return data
  }

  public getCurrentChannels() {
    if (!this.database) throw ERR_DB_NOT_INIT

    return this.database.find({ currentVoiceChannel: { $ne: '' } }).toArray()
  }

  public async updateChannel(serverID: string, channelID: string) {
    if (!this.database) throw ERR_DB_NOT_INIT

    return await this.database.findOneAndUpdate({ serverID }, { $set: { channelID } }, { returnDocument: ReturnDocument.AFTER })
  }

  public async updateLang(serverID: string, lang: string) {
    if (!this.database) throw ERR_DB_NOT_INIT

    return await this.database.findOneAndUpdate({ serverID }, { $set: { lang } }, { returnDocument: ReturnDocument.AFTER })
  }

  public async updateLastVoiceChannel(serverID: string, lastVoiceChannel: string) {
    if (!this.database) throw ERR_DB_NOT_INIT

    return await this.database.findOneAndUpdate({ serverID }, { $set: { lastVoiceChannel } }, { returnDocument: ReturnDocument.AFTER })
  }

  public async updateCurrentVoiceChannel(serverID: string, currentVoiceChannel: string) {
    if (!this.database) throw ERR_DB_NOT_INIT

    return await this.database.findOneAndUpdate({ serverID }, { $set: { currentVoiceChannel } }, { returnDocument: ReturnDocument.AFTER })
  }
}
