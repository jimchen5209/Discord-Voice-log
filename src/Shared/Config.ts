import { constants, copyFileSync as copyFile, existsSync as exists, readFileSync as readFile, writeFileSync as writeFile } from 'node:fs'
import type { ILogObj, ISettingsParam, Logger } from 'tslog'
import { GoogleCloudTTS } from '../Audio/Providers/GoogleCloudTTS'
import { EXIT_NO_RESTART } from './ExitCode'

export interface ConfigValue {
  configVersion: string | number
  platform: PlatformConfig
  tts: TtsConfig
  sqlite: SQLiteConfig
  debug: boolean
}

export interface PlatformConfig {
  discord: DiscordConfig
  fluxer: FluxerInstanceConfig[]
}

export interface DiscordConfig {
  enabled: boolean
  botToken: string
  applicationID: string
  publicKey: string
  admins: string[]
}

// One Fluxer instance (official or self-hosted). id is the stable instanceId stored with its data:
// never derive it from the origin, and never change it once the instance has data.
export interface FluxerInstanceConfig {
  id: string
  enabled: boolean
  origin: string
  botToken: string
  admins: string[]
}

// Lowercase letters, digits and dashes; "discord" is the instanceId of the Discord scope
const FLUXER_INSTANCE_ID = /^[a-z0-9-]+$/

function isHttpsOrigin(origin: string) {
  try {
    return new URL(origin).protocol === 'https:'
  } catch {
    return false
  }
}

export interface GoogleTTSConfig {
  apiKey: string
}

export interface XaiTTSConfig {
  apiKey: string
}

export interface SystemVoiceConfig {
  provider: string
  lang: string
  voice: string
}

export interface TtsProvidersConfig {
  googleTTS: GoogleTTSConfig
  xaiTTS: XaiTTSConfig
}

export interface TtsConfig {
  providers: TtsProvidersConfig
  systemVoice: SystemVoiceConfig
}

export interface SQLiteConfig {
  databaseUrl: string
}

export const loggerOptions: ISettingsParam<ILogObj> = {
  name: 'Main',
  prettyLogTimeZone: 'local',
  hideLogPositionForProduction: true,
  minLevel: 3 // Info
}

export class Config {
  private configVersion = 6
  private _platform: PlatformConfig
  private _tts: TtsConfig
  private _sqlite: SQLiteConfig
  private _debug: boolean
  private logger: Logger<ILogObj>

  private readonly discordDefault: DiscordConfig = {
    enabled: true,
    botToken: '',
    applicationID: '',
    publicKey: '',
    admins: []
  }
  // Used when the file has no platform.fluxer; an empty list stays empty
  private readonly fluxerDefault = (): FluxerInstanceConfig[] => [{ id: 'official', enabled: false, origin: 'https://fluxer.com', botToken: '', admins: [] }]
  private readonly googleTTSDefault = { apiKey: '' }
  private readonly xaiTTSDefault = { apiKey: '' }
  private readonly systemVoiceDefault: SystemVoiceConfig = {
    provider: GoogleCloudTTS.id,
    lang: 'en-US',
    voice: 'en-US-Wavenet-D'
  }
  private readonly ttsDefault: TtsConfig = {
    providers: {
      googleTTS: this.googleTTSDefault,
      xaiTTS: this.xaiTTSDefault
    },
    systemVoice: this.systemVoiceDefault
  }
  private readonly sqliteDefault = { databaseUrl: 'file:./prisma/voice-log.db' }

  constructor(mainLogger: Logger<ILogObj>) {
    this.logger = mainLogger.getSubLogger({ name: 'Config' })
    this.logger.info('Loading Config...')

    let versionChanged = false

    if (exists('./config.json')) {
      const config = JSON.parse(readFile('config.json', { encoding: 'utf-8' }))

      versionChanged = this.checkVersion(config.configVersion)

      // read and migrate config
      this._platform = {
        discord: this.mergeDiscordConfig(config),
        fluxer: this.mergeFluxerConfig(config.platform?.fluxer)
      }
      this.validatePlatform()

      this._tts = this.mergeTts(config)

      if (!config.sqlite) config.sqlite = {}
      this._sqlite = {
        databaseUrl: config.sqlite.databaseUrl ? config.sqlite.databaseUrl : this.sqliteDefault.databaseUrl
      }

      this._debug = config.debug ? config.debug : config.Debug ? config.Debug : false

      if (versionChanged) {
        this.backupAndQuit(config)
      }
      this.save()
    } else {
      this.logger.fatal("Can't load config.json: File not found.")
      this.logger.info('Generating empty config...')
      this._platform = { discord: this.discordDefault, fluxer: this.fluxerDefault() }
      this._tts = this.ttsDefault
      this._sqlite = this.sqliteDefault
      this._debug = false
      this.save()
      this.logger.info('Fill your config and try again.')
      process.exit(EXIT_NO_RESTART)
    }
  }

  private checkVersion(version: number) {
    if (!version || version < this.configVersion) return true
    if (version > this.configVersion) {
      this.logger.fatal('This config version is newer than me! Consider upgrading to the latest version or reset your configuration.')
      process.exit(EXIT_NO_RESTART)
    }
    return false
  }

  // platform.discord since version 6; discord, or TOKEN and admins, before
  private mergeDiscordConfig(config: {
    platform?: { discord?: Partial<DiscordConfig> }
    discord?: Partial<DiscordConfig>
    // biome-ignore lint/style/useNamingConvention: Legacy config
    TOKEN?: string
    admins?: string[]
  }): DiscordConfig {
    const discord = config.platform?.discord ?? config.discord ?? {}
    return {
      // Discord was the only platform before version 6, so an upgraded config keeps it running
      enabled: typeof discord.enabled === 'boolean' ? discord.enabled : this.discordDefault.enabled,
      botToken: discord.botToken ? discord.botToken : config.TOKEN ? config.TOKEN : this.discordDefault.botToken,
      applicationID: discord.applicationID ? discord.applicationID : this.discordDefault.applicationID,
      publicKey: discord.publicKey ? discord.publicKey : this.discordDefault.publicKey,
      admins: discord.admins ? discord.admins : config.admins ? config.admins : this.discordDefault.admins
    }
  }

  private mergeFluxerConfig(fluxer: unknown): FluxerInstanceConfig[] {
    if (fluxer === undefined) return this.fluxerDefault()
    if (!Array.isArray(fluxer)) this.invalid(['platform.fluxer must be a list of instances'])
    return (fluxer as unknown[]).map((entry, index) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) this.invalid([`platform.fluxer[${index}] must be an object`])
      const instance = entry as Partial<FluxerInstanceConfig>
      return {
        id: typeof instance.id === 'string' ? instance.id : '',
        enabled: instance.enabled === true,
        origin: typeof instance.origin === 'string' ? instance.origin : '',
        botToken: typeof instance.botToken === 'string' ? instance.botToken : '',
        admins: Array.isArray(instance.admins) ? instance.admins.filter((admin): admin is string => typeof admin === 'string') : []
      }
    })
  }

  // Fatal on a config that would mix up scopes or send a token to the wrong place; config.json is left as it is.
  // Never logs a token.
  private validatePlatform() {
    const problems: string[] = []
    const seen = new Set<string>()
    this._platform.fluxer.forEach((instance, index) => {
      const name = `platform.fluxer[${index}]`
      if (!FLUXER_INSTANCE_ID.test(instance.id)) problems.push(`${name}.id ${JSON.stringify(instance.id)} must use only a-z, 0-9 and -`)
      else if (instance.id === 'discord') problems.push(`${name}.id cannot be "discord"`)
      else if (seen.has(instance.id)) problems.push(`${name}.id "${instance.id}" is used twice`)
      seen.add(instance.id)
      if (!isHttpsOrigin(instance.origin)) problems.push(`${name}.origin ${JSON.stringify(instance.origin)} must be an https:// URL`)
      if (instance.enabled && !instance.botToken) problems.push(`${name} is enabled but has no botToken`)
    })
    if (problems.length > 0) this.invalid(problems)
  }

  private invalid(problems: string[]): never {
    this.logger.fatal(`Invalid config.json, nothing was changed: ${problems.join('; ')}`)
    process.exit(EXIT_NO_RESTART)
  }

  private mergeTts(config: {
    tts?: {
      providers?: { googleTTS?: { apiKey?: string }; xaiTTS?: { apiKey?: string } }
      systemVoice?: Partial<SystemVoiceConfig>
    }
    googleTTS?: { apiKey?: string }
    xaiTTS?: { apiKey?: string }
    googleAPIKey?: string
    systemVoice?: Partial<SystemVoiceConfig>
  }): TtsConfig {
    const providers = config.tts?.providers
    const googleFromFile = providers?.googleTTS?.apiKey ? providers.googleTTS.apiKey : config.googleTTS?.apiKey
    const xaiFromFile = providers?.xaiTTS?.apiKey ? providers.xaiTTS.apiKey : config.xaiTTS?.apiKey
    return {
      providers: {
        googleTTS: {
          apiKey: googleFromFile ? googleFromFile : config.googleAPIKey ? config.googleAPIKey : this.googleTTSDefault.apiKey
        },
        xaiTTS: {
          apiKey: xaiFromFile ? xaiFromFile : this.xaiTTSDefault.apiKey
        }
      },
      systemVoice: this.mergeSystemVoice(config.tts?.systemVoice ?? config.systemVoice)
    }
  }

  private mergeSystemVoice(systemVoice: Partial<SystemVoiceConfig> | undefined): SystemVoiceConfig {
    return {
      provider: systemVoice?.provider ? systemVoice.provider : this.systemVoiceDefault.provider,
      lang: systemVoice?.lang ? systemVoice.lang : this.systemVoiceDefault.lang,
      voice: systemVoice?.voice ? systemVoice.voice : this.systemVoiceDefault.voice
    }
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
    process.exit(EXIT_NO_RESTART)
  }

  private save() {
    const json = JSON.stringify(
      {
        '//configVersion': 'DO NOT MODIFY THIS UNLESS YOU KNOW WHAT YOU ARE DOING!!!!!',
        configVersion: this.configVersion,
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
