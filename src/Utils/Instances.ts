import { ILogObj, Logger } from 'tslog'
import type { Discord } from '../Core/Discord/Core'
import type { MongoDB } from '../Core/MongoDB/Core'
import { Config, loggerOptions } from './Config'
import { Lang } from './Lang'
import { TTSHelper } from './TTSHelper'
import { PluginManager } from '../Plugin/Core'

interface Instances {
  mainLogger: Logger<ILogObj>
  config: Config
  lang: Lang
  ttsHelper: TTSHelper
  pluginManager: PluginManager
  discord: Discord | undefined
  mongoDB: MongoDB | undefined
}

// Static instances
const mainLogger = new Logger(loggerOptions)
const config = new Config(mainLogger)
const lang = new Lang(mainLogger)
const ttsHelper = new TTSHelper(config, mainLogger)
const pluginManager = new PluginManager(mainLogger)

export const instances: Instances = {
  mainLogger,
  config,
  lang,
  ttsHelper,
  pluginManager,
  discord: undefined,
  mongoDB: undefined
}
