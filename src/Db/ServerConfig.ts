import type { PrismaClient, ServerConfig as PrismaServerConfig } from '@prisma/client'
import type { ILogObj, Logger } from 'tslog'
import { GoogleCloudTTS } from '../Audio/Providers/GoogleCloudTTS'
import type { GuildKey, PlatformScope } from '../Platform/Scope'

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

// The table has no scope column yet, so every row belongs to Discord and serverID is the Discord guild id
function assertStoredScope(scope: PlatformScope) {
  if (scope.platform !== 'discord' || scope.instanceId !== 'discord') {
    throw new Error(`Server config cannot store the ${scope.platform}:${scope.instanceId} scope yet`)
  }
}

function serverIdOf(guild: GuildKey) {
  assertStoredScope(guild)
  return guild.guildId
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
    const serverID = serverIdOf(guild)
    this.logger.debug(`Creating server config for ${serverID}`)
    const data = {
      serverID,
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
      this.logger.error(`Failed to create server config for ${serverID}:`, e)
      return null
    }
  }

  public async get(guild: GuildKey) {
    const serverID = serverIdOf(guild)
    this.logger.debug(`Getting server config for ${serverID}`)
    const config = await this.prisma.serverConfig.findUnique({
      where: { serverID }
    })
    if (!config) {
      this.logger.debug(`No server config found for ${serverID}`)
      return null
    }

    return toServerConfig(config)
  }

  public async getOrCreate(guild: GuildKey) {
    this.logger.debug(`Getting or creating server config for ${guild.guildId}`)
    let data = await this.get(guild)
    if (!data) {
      data = await this.create(guild)
    }
    if (!data) throw Error('Data insert failed.')
    return data
  }

  // Guilds of the scope where the bot was in a voice channel; serverID is the guild id within the scope
  public async getCurrentChannels(scope: PlatformScope) {
    assertStoredScope(scope)
    const configs = await this.prisma.serverConfig.findMany({
      where: {
        currentVoiceChannel: { not: '' }
      }
    })
    this.logger.debug(`Found ${configs.length} active voice channel(s)`)

    return configs.map(toServerConfig)
  }

  public async updateChannel(guild: GuildKey, channelID: string) {
    const serverID = serverIdOf(guild)
    this.logger.debug(`Updating channelID for ${serverID}: ${channelID}`)
    const result = await this.prisma.serverConfig.update({
      where: { serverID },
      data: { channelID }
    })
    return toServerConfig(result)
  }

  public async updateLang(guild: GuildKey, lang: string) {
    const serverID = serverIdOf(guild)
    this.logger.debug(`Updating lang for ${serverID}: ${lang}`)
    const result = await this.prisma.serverConfig.update({
      where: { serverID },
      data: { lang }
    })
    return toServerConfig(result)
  }

  public async updateLastVoiceChannel(guild: GuildKey, lastVoiceChannel: string) {
    const serverID = serverIdOf(guild)
    this.logger.debug(`Updating lastVoiceChannel for ${serverID}: ${lastVoiceChannel}`)
    const result = await this.prisma.serverConfig.update({
      where: { serverID },
      data: { lastVoiceChannel }
    })
    return toServerConfig(result)
  }

  public async updateCurrentVoiceChannel(guild: GuildKey, currentVoiceChannel: string) {
    const serverID = serverIdOf(guild)
    this.logger.debug(`Updating currentVoiceChannel for ${serverID}: ${currentVoiceChannel}`)
    const result = await this.prisma.serverConfig.update({
      where: { serverID },
      data: { currentVoiceChannel }
    })
    return toServerConfig(result)
  }

  public async updateVoiceMessageTTS(guild: GuildKey, voiceMessageTTS: IVoiceMessageTTS) {
    const serverID = serverIdOf(guild)
    this.logger.debug(`Updating TTS config for ${serverID}: provider=${voiceMessageTTS.provider}, lang=${voiceMessageTTS.voiceLang}`)
    const result = await this.prisma.serverConfig.update({
      where: { serverID },
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
