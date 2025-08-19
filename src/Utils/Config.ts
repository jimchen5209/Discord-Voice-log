import { constants, copyFileSync as copyFile, existsSync as exists, readFileSync as readFile, writeFileSync as writeFile } from 'fs'
import { ILogObj, ISettingsParam, Logger } from 'tslog'

export interface ConfigValue {
  configVersion: string | number
  discord: DiscordConfig
  googleTTS: GoogleTTSConfig
  mongodb: MongoDBConfig
  debug: boolean
}

export interface DiscordConfig {
  botToken: string
  applicationID: string
  publicKey: string
  admins: string[]
}

export interface GoogleTTSConfig {
  apiKey: string
}

export interface MongoDBConfig {
  host: string
  name: string
}

export const loggerOptions: ISettingsParam<ILogObj> = {
  name: 'Main',
  prettyLogTimeZone: 'local',
  hideLogPositionForProduction: true,
  minLevel: 3 // Info
}

export class Config {
  private configVersion = 2
  private _discord: DiscordConfig
  private _googleTTS: GoogleTTSConfig
  private _mongodb: MongoDBConfig
  private _debug: boolean
  private logger: Logger<ILogObj>

  private readonly discordDefault = {
    botToken: '',
    applicationID: '',
    publicKey: '',
    admins: []
  }
  private readonly googleTTSDefault = { apiKey: '' }
  private readonly mongodbDefault = {
    host: 'mongodb://localhost:27017',
    name: 'VoiceLog'
  }

  constructor(mainLogger: Logger<ILogObj>) {
    this.logger = mainLogger.getSubLogger({ name: 'Config' })
    this.logger.info('Loading Config...')

    let versionChanged = false

    if (exists('./config.json')) {
      const config = JSON.parse(readFile('config.json', { encoding: 'utf-8' }))

      versionChanged = this.checkVersion(config.configVersion)

      // read and migrate config
      if (!config.discord) config.discord = {}
      this._discord = this.mergeDiscordConfig(config)

      if (!config.googleTTS) config.googleTTS = {}
      this._googleTTS = this.mergeGoogleTTSConfig(config)

      if (!config.mongodb) config.mongodb = {}
      this._mongodb = this.mergeMongoDBConfig(config)

      this._debug = config.debug ? config.debug : config.Debug ? config.Debug : false

      this.save()

      if (versionChanged) {
        this.backupAndQuit(config)
      }
    } else {
      this.logger.fatal("Can't load config.json: File not found.")
      this.logger.info('Generating empty config...')
      this._discord = this.discordDefault
      this._googleTTS = this.googleTTSDefault
      this._mongodb = this.mongodbDefault
      this._debug = false
      this.save()
      this.logger.info('Fill your config and try again.')
      process.exit(1)
    }
  }

  private checkVersion(version: number) {
    if (!version || version < this.configVersion) return true
    if (version > this.configVersion) {
      this.logger.fatal('This config version is newer than me! Consider upgrading to the latest version or reset your configuration.')
      process.exit(1)
    }
    return false
  }

  private mergeDiscordConfig(config: {
    discord: {
      botToken: string
      applicationID: string
      publicKey: string
      admins: string[]
    }
    TOKEN: string
    admins: string[]
  }) {
    return {
      botToken: config.discord.botToken ? config.discord.botToken : config.TOKEN ? config.TOKEN : this.discordDefault.botToken,
      applicationID: config.discord.applicationID ? config.discord.applicationID : this.discordDefault.applicationID,
      publicKey: config.discord.publicKey ? config.discord.publicKey : this.discordDefault.publicKey,
      admins: config.discord.admins ? config.discord.admins : config.admins ? config.admins : this.discordDefault.admins
    } as DiscordConfig
  }

  private mergeGoogleTTSConfig(config: { googleTTS: { apiKey: string }; googleAPIKey: string }) {
    return {
      apiKey: config.googleTTS.apiKey ? config.googleTTS.apiKey : config.googleAPIKey ? config.googleAPIKey : this.googleTTSDefault.apiKey
    } as GoogleTTSConfig
  }

  private mergeMongoDBConfig(config: { mongodb: { host: string; name: string }; database: { host: string; name: string } }) {
    return {
      host: config.mongodb.host ? config.mongodb.host : config.database.host ? config.database.host : this.mongodbDefault.host,
      name: config.mongodb.name ? config.mongodb.name : config.database.name ? config.database.name : this.mongodbDefault.name
    } as MongoDBConfig
  }

  private backupAndQuit(config: ConfigValue) {
    if (!config.configVersion) config.configVersion = 'legacy'
    let copyConfigName = `./config-${config.configVersion}.json`
    if (exists(copyConfigName)) {
      let copyNumber = 1
      copyConfigName = `./config-${config.configVersion}-${copyNumber}.json`
      while (exists(copyConfigName)) {
        copyNumber++
        copyConfigName = `./config-${config.configVersion}-${copyNumber}.json`
      }
    }

    // backup old config
    copyFile('./config.json', copyConfigName, constants.COPYFILE_EXCL)
    // save new config
    this.save()

    this.logger.warn('Detected config version change and we have tried to backup and migrate into it! Consider checking your config file.')
    process.exit(1)
  }

  private save() {
    const json = JSON.stringify(
      {
        '//configVersion': 'DO NOT MODIFY THIS UNLESS YOU KNOW WHAT YOU ARE DOING!!!!!',
        configVersion: this.configVersion,
        discord: this._discord,
        googleTTS: this._googleTTS,
        mongodb: this._mongodb,
        debug: this._debug
      },
      null,
      4
    )
    writeFile('./config.json', json, 'utf8')
  }

  public get discord() {
    return this._discord
  }

  public get googleTTS() {
    return this._googleTTS
  }

  public get mongodb() {
    return this._mongodb
  }

  public get debug() {
    return this._debug
  }
}
