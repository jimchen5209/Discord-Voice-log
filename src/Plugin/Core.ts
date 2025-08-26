import { existsSync as exists, readdirSync as readDir } from 'node:fs'
import { extname } from 'node:path'
import type { ILogObj, Logger } from 'tslog'
import type { IPluginBase } from './Base/PluginBase'
import type { IVoiceOverwrite } from './Base/VoiceOverwrite'

export class PluginManager {
  private logger: Logger<ILogObj>
  private loadedPlugins: { [key: string]: IPluginBase } = {}
  private _voiceOverwrites: { [key: string]: IVoiceOverwrite } = {}

  constructor(mainLogger: Logger<ILogObj>) {
    this.logger = mainLogger.getSubLogger({ name: 'Plugin' })

    this.reloadPluginList().then(() => {
      this.enablePlugins()
    })
  }

  public async reloadPluginList() {
    this.logger.info('Loading plugins...')
    if (!exists(`${__dirname}/Plugins/`)) {
      this.logger.error(`${__dirname}/Plugins/ not found, skipping`)
      return
    }
    const files = readDir(`${__dirname}/Plugins/`)

    for (const file of files) {
      if (extname(file) === '.js') {
        const value = await import(`${__dirname}/Plugins/${file}`)
        for (const className of Object.keys(value)) {
          if (!value[className]) continue
          this.logger.info(`Found ${className} in ${file}`)
          this.loadedPlugins[className] = new value[className]()
          this.logger.info(`Loaded ${className} as ${this.loadedPlugins[className].pluginName} (${this.loadedPlugins[className].description})`)
        }
      }
    }
  }

  private enablePlugins() {
    // Todo config
    for (const className of Object.keys(this.loadedPlugins)) {
      this.enablePlugin(className)
    }
  }

  public enablePlugin(className: string): boolean {
    if ((this.loadedPlugins[className] as IVoiceOverwrite).typeVoiceOverwrite) {
      this._voiceOverwrites[className] = this.loadedPlugins[className] as IVoiceOverwrite
      this.logger.info(`Enabled ${this.loadedPlugins[className].pluginName} as IVoiceOverwrite`)
      return true
    }

    this.logger.error(`Enable ${this.loadedPlugins[className].pluginName} failed: No compatible plugins found`)
    return false
  }

  public disablePlugin(className: string): boolean {
    if (Object.keys(this._voiceOverwrites).includes(className)) {
      delete this._voiceOverwrites[className]
      this.logger.info(`Disabled ${this.loadedPlugins[className].pluginName}`)
      return true
    }

    this.logger.error(`Disable ${this.loadedPlugins[className].pluginName} failed: Plugin is not enabled`)
    return false
  }

  public get voiceOverwrites() {
    return Object.values(this._voiceOverwrites)
  }
}
