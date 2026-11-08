import { existsSync as exists, readFileSync as readFile, writeFileSync as writeFile } from 'node:fs'
import type { ILogObj, Logger } from 'tslog'
import { EXIT_NO_RESTART } from '../Shared/ExitCode'
import { defaultPlatform, defaultSQLite, defaultTTS } from './Defaults'
import type { PlatformConfig, SQLiteConfig, TTSConfig } from './Types'
import { backupConfigFile, CONFIG_VERSION, compareVersion, migrateConfig, type RawConfig } from './Upgrade'

export class Config {
  private _platform: PlatformConfig
  private _tts: TTSConfig
  private _sqlite: SQLiteConfig
  private _debug: boolean
  private logger: Logger<ILogObj>

  constructor(mainLogger: Logger<ILogObj>) {
    this.logger = mainLogger.getSubLogger({ name: 'Config' })
    this.logger.info('Loading Config...')

    if (!exists('./config.json')) {
      this.logger.fatal("Can't load config.json: File not found.")
      this.logger.info('Generating empty config...')
      this._platform = defaultPlatform()
      this._tts = defaultTTS()
      this._sqlite = defaultSQLite()
      this._debug = false
      this.save()
      this.logger.info('Fill your config and try again.')
      process.exit(EXIT_NO_RESTART)
    }

    const raw: RawConfig = JSON.parse(readFile('config.json', { encoding: 'utf-8' }))

    const version = compareVersion(raw.configVersion)
    if (version === 'newer') {
      this.logger.fatal('This config version is newer than me! Consider upgrading to the latest version or reset your configuration.')
      process.exit(EXIT_NO_RESTART)
    }

    const config = migrateConfig(raw)
    // Fatal on a config that would mix up scopes or send a token to the wrong place; config.json is left as it is
    if (config.problems.length > 0) {
      this.logger.fatal(`Invalid config.json, nothing was changed: ${config.problems.join('; ')}`)
      process.exit(EXIT_NO_RESTART)
    }
    this._platform = config.platform
    this._tts = config.tts
    this._sqlite = config.sqlite
    this._debug = config.debug

    if (version === 'older') {
      backupConfigFile(raw.configVersion)
      this.save()
      this.logger.warn('Detected config version change and we have tried to backup and migrate into it! Consider checking your config file.')
      process.exit(EXIT_NO_RESTART)
    }
    this.save()
  }

  private save() {
    const json = JSON.stringify(
      {
        '//configVersion': 'DO NOT MODIFY THIS UNLESS YOU KNOW WHAT YOU ARE DOING!!!!!',
        configVersion: CONFIG_VERSION,
        platform: this._platform,
        tts: this._tts,
        sqlite: this._sqlite,
        debug: this._debug
      },
      null,
      4
    )
    writeFile('./config.json', json, 'utf8')
  }

  public get platform() {
    return this._platform
  }

  public get tts() {
    return this._tts
  }

  public get sqlite() {
    return this._sqlite
  }

  public get debug() {
    return this._debug
  }
}
