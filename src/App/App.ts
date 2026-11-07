import { type ILogObj, Logger } from 'tslog'
import { Audio } from '../Audio/Audio'
import { GoogleCloudTTS } from '../Audio/Providers/GoogleCloudTTS'
import { GoogleTranslateTTS } from '../Audio/Providers/GoogleTranslateTTS'
import { XaiTTS } from '../Audio/Providers/XaiTTS'
import { PluginManager } from '../Plugin/Core'
import { Config, loggerOptions } from '../Shared/Config'
import { Lang } from '../Shared/Lang'

export interface App {
  mainLogger: Logger<ILogObj>
  config: Config
  lang: Lang
  audio: Audio
  pluginManager: PluginManager
}

let app: App | undefined

export function createApp(): App {
  if (app) throw new Error('createApp() called twice')

  const mainLogger = new Logger(loggerOptions)
  const config = new Config(mainLogger)
  const lang = new Lang(mainLogger)
  const pluginManager = new PluginManager(mainLogger)
  // Composition root: register providers by id here (or inject one) without touching the audio module
  const googleCloud = new GoogleCloudTTS(() => config.googleTTS.apiKey, mainLogger)
  const providers = [new GoogleTranslateTTS(mainLogger), googleCloud, new XaiTTS(() => config.xaiTTS.apiKey, mainLogger)]
  const audio = new Audio(new Map(providers.map((provider) => [provider.id, provider])), pluginManager, mainLogger, {
    systemProvider: googleCloud.id
  })

  app = { mainLogger, config, lang, pluginManager, audio }
  return app
}

export function getApp(): App {
  if (!app) throw new Error('getApp() called before createApp()')
  return app
}
