import { EventEmitter } from 'events'
import { LogHelper } from 'tslog-helper'
import { Discord } from './Components/Discord/Core'
import { Config } from './Core/Config'
import { MongoDB } from './Components/MongoDB/Core'
import { ServerConfigManager } from './Components/MongoDB/db/ServerConfig'
import { Status }from 'status-client'
import { PluginManager } from './Components/Plugin/Core'
import { TTSHelper } from './Core/TTSHelper'
import { Lang } from './Core/Lang'

export class Core extends EventEmitter {
  private readonly logHelper = new LogHelper()
  public readonly mainLogger = this.logHelper.logger
  public readonly config = new Config(this)
  public readonly database = new MongoDB(this)
  public readonly data = new ServerConfigManager(this)
  public readonly ttsHelper = new TTSHelper(this)
  public readonly lang = new Lang(this)
  public readonly plugins = new PluginManager(this)
  private readonly status = new Status('VoiceLog')
  constructor() {
    super()
    this.mainLogger.info('Starting...')

    if (this.config.debug)
      this.mainLogger.setSettings({ minLevel: 'silly' })

    this.emit('init', this)

    // Wait DB connect
    this.database.on('connect', () => this.emit('ready'))
    this.database.on('error', () => {
      this.mainLogger.error('Unable to connect to database. Quitting...')
      process.exit(1)
    })
    this.on('ready', async () => {
      try {
        new Discord(this)
      } catch (error) {
        console.error(error)
      }

      this.status.set_status()
    })
  }
}

new Core()
