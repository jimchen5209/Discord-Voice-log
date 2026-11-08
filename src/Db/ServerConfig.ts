import type { PrismaClient, ServerConfig as PrismaServerConfig } from '@prisma/client'
import type { ILogObj, Logger } from 'tslog'
import { GoogleCloudTTS } from '../Audio/Providers/GoogleCloudTTS'
import { type GuildKey, guildKeyString, type PlatformScope } from '../Platform/Scope'

export const DEFAULT_TTS_PROVIDER = GoogleCloudTTS.id

export interface IVoiceMessageTTS {
  enabled: boolean
  messageLang: string
  // TTS provider id, see Audio.providerIds()
  provider: string
  voiceLang: string
  voiceName: string
}

export interface IServerConfig {
  // The guild id within the scope of the row (platform, instanceId)
  serverID: string
  lang: string
  channelID: string
  lastVoiceChannel: string
  currentVoiceChannel: string
  voiceMessageTTS: IVoiceMessageTTS
}

function toServerConfig(data: PrismaServerConfig): IServerConfig {
  return {
    ...data,
    voiceMessageTTS: {
      enabled: data.ttsEnabled,
      messageLang: data.ttsMessageLang,
      provider: data.ttsProvider,
      voiceLang: data.ttsVoiceLang,
      voiceName: data.ttsVoiceName
    }
  }
}

// The row of a guild: serverID is the guild id within the scope
function whereOf(guild: GuildKey) {
  // biome-ignore lint/style/useNamingConvention: Prisma's name for the compound primary key
  return { platform_instanceId_serverID: { platform: guild.platform, instanceId: guild.instanceId, serverID: guild.guildId } }
}

// For logs; Discord guilds keep the bare id they were logged with before
function labelOf(guild: GuildKey) {
  return guild.platform === 'discord' ? guild.guildId : guildKeyString(guild)
}

/**
 * This class is kept as a shell to maintain compatibility with the existing MongoDB setup
 * but internally it uses Prisma.
 */
export class DbServerConfigManager {
  private prisma: PrismaClient
  private logger: Logger<ILogObj>

  constructor(prisma: PrismaClient, logger: Logger<ILogObj>) {
    this.prisma = prisma
    this.logger = logger
  }

  public async create(
    guild: GuildKey,
    channelID = '',
    lang = 'en_US',
    lastVoiceChannel = '',
    currentVoiceChannel = '',
    voiceMessageTTS: IVoiceMessageTTS = {
      enabled: false,
      messageLang: 'en_US',
      provider: DEFAULT_TTS_PROVIDER,
      voiceLang: 'en-US',
      voiceName: 'en-US-Wavenet-A'
    }
  ) {
    const label = labelOf(guild)
    this.logger.debug(`Creating server config for ${label}`)
    const data = {
      ...whereOf(guild).platform_instanceId_serverID,
      channelID,
      lang,
      lastVoiceChannel,
      currentVoiceChannel,
      ttsEnabled: voiceMessageTTS.enabled,
      ttsMessageLang: voiceMessageTTS.messageLang,
      ttsProvider: voiceMessageTTS.provider,
      ttsVoiceLang: voiceMessageTTS.voiceLang,
      ttsVoiceName: voiceMessageTTS.voiceName
    }

    try {
      const result = await this.prisma.serverConfig.create({ data })
      return toServerConfig(result)
    } catch (e) {
      this.logger.error(`Failed to create server config for ${label}:`, e)
      return null
    }
  }

  public async get(guild: GuildKey) {
    const label = labelOf(guild)
    this.logger.debug(`Getting server config for ${label}`)
    const config = await this.prisma.serverConfig.findUnique({ where: whereOf(guild) })
    if (!config) {
      this.logger.debug(`No server config found for ${label}`)
      return null
    }

    return toServerConfig(config)
  }

  public async getOrCreate(guild: GuildKey) {
    this.logger.debug(`Getting or creating server config for ${labelOf(guild)}`)
    let data = await this.get(guild)
    if (!data) {
      data = await this.create(guild)
    }
    if (!data) throw Error('Data insert failed.')
    return data
  }

  // Guilds of the scope where the bot was in a voice channel; serverID is the guild id within the scope
  public async getCurrentChannels(scope: PlatformScope) {
    const configs = await this.prisma.serverConfig.findMany({
      where: {
        platform: scope.platform,
        instanceId: scope.instanceId,
        currentVoiceChannel: { not: '' }
      }
    })
    this.logger.debug(`Found ${configs.length} active voice channel(s)`)

    return configs.map(toServerConfig)
  }

  public async updateChannel(guild: GuildKey, channelID: string) {
    this.logger.debug(`Updating channelID for ${labelOf(guild)}: ${channelID}`)
    const result = await this.prisma.serverConfig.update({
      where: whereOf(guild),
      data: { channelID }
    })
    return toServerConfig(result)
  }

  public async updateLang(guild: GuildKey, lang: string) {
    this.logger.debug(`Updating lang for ${labelOf(guild)}: ${lang}`)
    const result = await this.prisma.serverConfig.update({
      where: whereOf(guild),
      data: { lang }
    })
    return toServerConfig(result)
  }

  public async updateLastVoiceChannel(guild: GuildKey, lastVoiceChannel: string) {
    this.logger.debug(`Updating lastVoiceChannel for ${labelOf(guild)}: ${lastVoiceChannel}`)
    const result = await this.prisma.serverConfig.update({
      where: whereOf(guild),
      data: { lastVoiceChannel }
    })
    return toServerConfig(result)
  }

  public async updateCurrentVoiceChannel(guild: GuildKey, currentVoiceChannel: string) {
    this.logger.debug(`Updating currentVoiceChannel for ${labelOf(guild)}: ${currentVoiceChannel}`)
    const result = await this.prisma.serverConfig.update({
      where: whereOf(guild),
      data: { currentVoiceChannel }
    })
    return toServerConfig(result)
  }

  public async updateVoiceMessageTTS(guild: GuildKey, voiceMessageTTS: IVoiceMessageTTS) {
    this.logger.debug(`Updating TTS config for ${labelOf(guild)}: provider=${voiceMessageTTS.provider}, lang=${voiceMessageTTS.voiceLang}`)
    const result = await this.prisma.serverConfig.update({
      where: whereOf(guild),
      data: {
        ttsEnabled: voiceMessageTTS.enabled,
        ttsMessageLang: voiceMessageTTS.messageLang,
        ttsProvider: voiceMessageTTS.provider,
        ttsVoiceLang: voiceMessageTTS.voiceLang,
        ttsVoiceName: voiceMessageTTS.voiceName
      }
    })
    return toServerConfig(result)
  }
}
