import { instances } from '../../Utils/Instances'
import { prisma } from '../SQLite/Client'
import { type IVoiceMessageTTS, VoiceMessageTTSType } from './db/ServerConfig'

export const ERR_DB_NOT_INIT = Error('Database is not initialized')
export const ERR_INSERT_FAILURE = Error('Data insert failed.')

export class SQLiteCore {
  private logger = instances.mainLogger.getSubLogger({ name: 'SQLite' })

  constructor() {
    this.logger.info('SQLite client initialized via Prisma')
  }

  public async close() {
    this.logger.info('Closing SQLite connection...')
    await prisma.$disconnect()
  }

  public get serverConfig() {
    return new DbServerConfigManager()
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

    return {
      ...config,
      voiceMessageTTS: {
        enabled: config.ttsEnabled,
        messageLang: config.ttsMessageLang,
        type: config.ttsType as VoiceMessageTTSType,
        voiceLang: config.ttsVoiceLang,
        voiceName: config.ttsVoiceName
      }
    }
  }

  public async getOrCreate(guildId: string) {
    let data = await this.get(guildId)
    if (!data) {
      data = await this.create(guildId)
    }
    if (!data) throw ERR_INSERT_FAILURE
    return data
  }

  public async getCurrentChannels() {
    const configs = await prisma.serverConfig.findMany({
      where: {
        currentVoiceChannel: { not: '' }
      }
    })

    return configs.map((config) => ({
      ...config,
      voiceMessageTTS: {
        enabled: config.ttsEnabled,
        messageLang: config.ttsMessageLang,
        type: config.ttsType as VoiceMessageTTSType,
        voiceLang: config.ttsVoiceLang,
        voiceName: config.ttsVoiceName
      }
    }))
  }

  public async updateChannel(serverID: string, channelID: string) {
    const result = await prisma.serverConfig.update({
      where: { serverID },
      data: { channelID }
    })
    return {
      ...result,
      voiceMessageTTS: {
        enabled: result.ttsEnabled,
        messageLang: result.ttsMessageLang,
        type: result.ttsType as VoiceMessageTTSType,
        voiceLang: result.ttsVoiceLang,
        voiceName: result.ttsVoiceName
      }
    }
  }

  public async updateLang(serverID: string, lang: string) {
    const result = await prisma.serverConfig.update({
      where: { serverID },
      data: { lang }
    })
    return {
      ...result,
      voiceMessageTTS: {
        enabled: result.ttsEnabled,
        messageLang: result.ttsMessageLang,
        type: result.ttsType as VoiceMessageTTSType,
        voiceLang: result.ttsVoiceLang,
        voiceName: result.ttsVoiceName
      }
    }
  }

  public async updateLastVoiceChannel(serverID: string, lastVoiceChannel: string) {
    const result = await prisma.serverConfig.update({
      where: { serverID },
      data: { lastVoiceChannel }
    })
    return {
      ...result,
      voiceMessageTTS: {
        enabled: result.ttsEnabled,
        messageLang: result.ttsMessageLang,
        type: result.ttsType as VoiceMessageTTSType,
        voiceLang: result.ttsVoiceLang,
        voiceName: result.ttsVoiceName
      }
    }
  }

  public async updateCurrentVoiceChannel(serverID: string, currentVoiceChannel: string) {
    const result = await prisma.serverConfig.update({
      where: { serverID },
      data: { currentVoiceChannel }
    })
    return {
      ...result,
      voiceMessageTTS: {
        enabled: result.ttsEnabled,
        messageLang: result.ttsMessageLang,
        type: result.ttsType as VoiceMessageTTSType,
        voiceLang: result.ttsVoiceLang,
        voiceName: result.ttsVoiceName
      }
    }
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
    return {
      ...result,
      voiceMessageTTS: {
        enabled: result.ttsEnabled,
        messageLang: result.ttsMessageLang,
        type: result.ttsType as VoiceMessageTTSType,
        voiceLang: result.ttsVoiceLang,
        voiceName: result.ttsVoiceName
      }
    }
  }
}
