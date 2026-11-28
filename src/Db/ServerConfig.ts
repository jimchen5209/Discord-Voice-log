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

function voiceWhereOf(guild: GuildKey) {
  return { platform: guild.platform, instanceId: guild.instanceId, serverID: guild.guildId }
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

  // Voice channels of the scope the bot was connected to, to reconnect on start
  public async getActiveVoiceChannels(scope: PlatformScope) {
    const rows = await this.prisma.voiceChannel.findMany({ where: { platform: scope.platform, instanceId: scope.instanceId, active: true } })
    this.logger.debug(`Found ${rows.length} active voice channel(s)`)
    return rows.map((row) => ({ guildId: row.serverID, channelId: row.channelID }))
  }

  // Voice channels of the guild the bot is in (active) or asleep in
  public async getVoiceChannels(guild: GuildKey) {
    const rows = await this.prisma.voiceChannel.findMany({ where: voiceWhereOf(guild) })
    return rows.map((row) => row.channelID)
  }

  public async setVoiceChannel(guild: GuildKey, channelID: string, active: boolean) {
    this.logger.debug(`Setting voice channel ${channelID} of ${labelOf(guild)}: ${active ? 'active' : 'asleep'}`)
    const key = { ...voiceWhereOf(guild), channelID }
    await this.prisma.voiceChannel.upsert({
      // biome-ignore lint/style/useNamingConvention: Prisma's name for the compound primary key
      where: { platform_instanceId_serverID_channelID: key },
      update: { active },
      create: { ...key, active }
    })
  }

  // Without a channel, every voice channel of the guild; { not } keeps that one
  public async removeVoiceChannel(guild: GuildKey, channelID?: string | { not: string }) {
    this.logger.debug(`Removing voice channel ${JSON.stringify(channelID ?? 'all')} of ${labelOf(guild)}`)
    await this.prisma.voiceChannel.deleteMany({ where: { ...voiceWhereOf(guild), channelID } })
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
