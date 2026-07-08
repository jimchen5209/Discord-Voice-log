import type { ServerConfig as PrismaServerConfig } from '@prisma/client'
import { prisma } from '../Client'

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
      return {
        ...result,
        voiceMessageTTS // Add back for compatibility with existing return type
      }
    } catch (_e) {
      return null
    }
  }

  public async get(serverID: string) {
    const config = await prisma.serverConfig.findUnique({
      where: { serverID }
    })
    if (!config) return null

    return toServerConfig(config)
  }

  public async getOrCreate(guildId: string) {
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

    return configs.map(toServerConfig)
  }

  public async updateChannel(serverID: string, channelID: string) {
    const result = await prisma.serverConfig.update({
      where: { serverID },
      data: { channelID }
    })
    return toServerConfig(result)
  }

  public async updateLang(serverID: string, lang: string) {
    const result = await prisma.serverConfig.update({
      where: { serverID },
      data: { lang }
    })
    return toServerConfig(result)
  }

  public async updateLastVoiceChannel(serverID: string, lastVoiceChannel: string) {
    const result = await prisma.serverConfig.update({
      where: { serverID },
      data: { lastVoiceChannel }
    })
    return toServerConfig(result)
  }

  public async updateCurrentVoiceChannel(serverID: string, currentVoiceChannel: string) {
    const result = await prisma.serverConfig.update({
      where: { serverID },
      data: { currentVoiceChannel }
    })
    return toServerConfig(result)
  }

  public async updateVoiceMessageTTS(serverID: string, voiceMessageTTS: IVoiceMessageTTS) {
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
