import { type ILogObj, Logger } from 'tslog'
import { Audio } from '../Audio/Audio'
import type { Discord } from '../Core/Discord/Core'
import type { SQLiteCore } from '../Core/SQLite/Core'
import { PluginManager } from '../Plugin/Core'
import { Config, loggerOptions } from './Config'
import { Lang } from './Lang'

interface INstances {
  mainLogger: Logger<ILogObj>
  config: Config
  lang: Lang
  audio: Audio
  pluginManager: PluginManager
  discord: Discord | undefined
  db: SQLiteCore | undefined
}

// Static instances
const mainLogger = new Logger(loggerOptions)
const config = new Config(mainLogger)
const lang = new Lang(mainLogger)
const pluginManager = new PluginManager(mainLogger)
const audio = new Audio(config, mainLogger, pluginManager)

export const instances: INstances = {
  mainLogger,
  config,
  lang,
  audio,
  pluginManager,
  discord: undefined,
  db: undefined
}
