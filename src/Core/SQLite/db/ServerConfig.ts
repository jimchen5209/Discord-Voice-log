import type { ServerConfig as PrismaServerConfig } from '@prisma/client'
import { instances } from '../../../Utils/Instances'
import { prisma } from '../Client'

const logger = instances.mainLogger.getSubLogger({ name: 'SQLite:ServerConfig' })

export enum VoiceMessageTTSType {
  WaveNet = 'WaveNet',
  Legacy = 'Legacy'
}

export interface IVoiceMessageTTS {
  enabled: boolean
  messageLang: string
  type: VoiceMessageTTSType
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
      type: data.ttsType as VoiceMessageTTSType,
      voiceLang: data.ttsVoiceLang,
      voiceName: data.ttsVoiceName
    }
  }
}

/**
 * This class is kept as a shell to maintain compatibility with the existing MongoDB setup
 * but internally it uses Prisma.
 */
export class DbServerConfigManager {
  public async create(
    serverID: string,
    channelID = '',
    lang = 'en_US',
    lastVoiceChannel = '',
    currentVoiceChannel = '',
    voiceMessageTTS: IVoiceMessageTTS = {
      enabled: false,
      messageLang: 'en_US',
      type: VoiceMessageTTSType.WaveNet,
      voiceLang: 'en-US',
      voiceName: 'en-US-Wavenet-A'
    }
  ) {
    logger.debug(`Creating server config for ${serverID}`)
    const data = {
      serverID,
      channelID,
      lang,
      lastVoiceChannel,
      currentVoiceChannel,
      ttsEnabled: voiceMessageTTS.enabled,
      ttsMessageLang: voiceMessageTTS.messageLang,
      ttsType: voiceMessageTTS.type,
      ttsVoiceLang: voiceMessageTTS.voiceLang,
      ttsVoiceName: voiceMessageTTS.voiceName
    }

    try {
      const result = await prisma.serverConfig.create({ data })
      return toServerConfig(result)
    } catch (e) {
      logger.error(`Failed to create server config for ${serverID}:`, e)
      return null
    }
  }

  public async get(serverID: string) {
    logger.debug(`Getting server config for ${serverID}`)
    const config = await prisma.serverConfig.findUnique({
      where: { serverID }
    })
    if (!config) {
      logger.debug(`No server config found for ${serverID}`)
      return null
    }

    return toServerConfig(config)
  }

  public async getOrCreate(guildId: string) {
    logger.debug(`Getting or creating server config for ${guildId}`)
    let data = await this.get(guildId)
    if (!data) {
      data = await this.create(guildId)
    }
    if (!data) throw Error('Data insert failed.')
    return data
  }

  public async getCurrentChannels() {
    const configs = await prisma.serverConfig.findMany({
      where: {
        currentVoiceChannel: { not: '' }
      }
    })
    logger.debug(`Found ${configs.length} active voice channel(s)`)

    return configs.map(toServerConfig)
  }

  public async updateChannel(serverID: string, channelID: string) {
    logger.debug(`Updating channelID for ${serverID}: ${channelID}`)
    const result = await prisma.serverConfig.update({
      where: { serverID },
      data: { channelID }
    })
    return toServerConfig(result)
  }

  public async updateLang(serverID: string, lang: string) {
    logger.debug(`Updating lang for ${serverID}: ${lang}`)
    const result = await prisma.serverConfig.update({
      where: { serverID },
      data: { lang }
    })
    return toServerConfig(result)
  }

  public async updateLastVoiceChannel(serverID: string, lastVoiceChannel: string) {
    logger.debug(`Updating lastVoiceChannel for ${serverID}: ${lastVoiceChannel}`)
    const result = await prisma.serverConfig.update({
      where: { serverID },
      data: { lastVoiceChannel }
    })
    return toServerConfig(result)
  }

  public async updateCurrentVoiceChannel(serverID: string, currentVoiceChannel: string) {
    logger.debug(`Updating currentVoiceChannel for ${serverID}: ${currentVoiceChannel}`)
    const result = await prisma.serverConfig.update({
      where: { serverID },
      data: { currentVoiceChannel }
    })
    return toServerConfig(result)
  }

  public async updateVoiceMessageTTS(serverID: string, voiceMessageTTS: IVoiceMessageTTS) {
    logger.debug(`Updating TTS config for ${serverID}: type=${voiceMessageTTS.type}, lang=${voiceMessageTTS.voiceLang}`)
    const result = await prisma.serverConfig.update({
      where: { serverID },
      data: {
        ttsEnabled: voiceMessageTTS.enabled,
        ttsMessageLang: voiceMessageTTS.messageLang,
        ttsType: voiceMessageTTS.type,
        ttsVoiceLang: voiceMessageTTS.voiceLang,
        ttsVoiceName: voiceMessageTTS.voiceName
      }
    })
    return toServerConfig(result)
  }
}
