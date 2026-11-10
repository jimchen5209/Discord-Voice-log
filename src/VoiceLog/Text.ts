import type { Client, TextChannel } from '@projectdysnomia/dysnomia'
import type { ILogObj, Logger } from 'tslog'
import type { DbServerConfigManager, IVoiceMessageTTS } from '../Db/ServerConfig'
import type { Discord } from '../Discord/Discord'
import type { Lang } from '../Shared/Lang'
import type { VoiceLog } from './VoiceLog'

const ERR_UNEXPECTED_LANG_STATUS = new Error('Unexpected lang set status')
const ERR_NO_PERMISSION = new Error('Not enough permissions to send message')

export enum VoiceLogSetStatus {
  AllSuccess,
  NotChanged,
  ChannelSuccess,
  LangSuccess,
  MissingLang,
  ChannelSuccessMissingLang
}

export class VoiceLogText {
  private client: Client
  private logger: Logger<ILogObj>
  private serverConfig: DbServerConfigManager
  private lang: Lang

  constructor(voiceLog: VoiceLog, discord: Discord, lang: Lang) {
    this.client = discord.client
    this.logger = voiceLog.logger.getSubLogger({ name: 'Text' })
    this.serverConfig = voiceLog.serverConfig
    this.lang = lang
  }

  public async setVoiceLog(guildId: string, channelId: string, lang: string | undefined = undefined): Promise<VoiceLogSetStatus> {
    const permissionCheck = (this.client.getChannel(channelId) as TextChannel).permissionsOf(this.client.user.id)
    if (!permissionCheck.has('sendMessages') || !permissionCheck.has('embedLinks')) {
      this.logger.error('Not enough permissions to send message')
      throw ERR_NO_PERMISSION
    }

    const data = await this.serverConfig.getOrCreate(guildId)
    if (lang) {
      if (data.channelID === channelId && data.lang === lang) return VoiceLogSetStatus.NotChanged
      if (data.channelID === channelId) {
        return await this.setLang(guildId, lang)
      }
      await this.serverConfig.updateChannel(guildId, channelId)
      switch (await this.setLang(guildId, lang)) {
        case VoiceLogSetStatus.LangSuccess:
          return VoiceLogSetStatus.AllSuccess
        case VoiceLogSetStatus.MissingLang:
          return VoiceLogSetStatus.ChannelSuccessMissingLang
        case VoiceLogSetStatus.NotChanged:
          return VoiceLogSetStatus.ChannelSuccess
        default:
          this.logger.error('Unexpected lang set status')
          throw ERR_UNEXPECTED_LANG_STATUS
      }
    }
    if (data.channelID === channelId) return VoiceLogSetStatus.NotChanged

    await this.serverConfig.updateChannel(guildId, channelId)
    return VoiceLogSetStatus.ChannelSuccess
  }

  public async setVoiceMessageTTS(guildId: string, ttsConfig: Partial<IVoiceMessageTTS>): Promise<IVoiceMessageTTS> {
    const data = await this.serverConfig.getOrCreate(guildId)
    const newTTS = { ...data.voiceMessageTTS, ...ttsConfig }
    await this.serverConfig.updateVoiceMessageTTS(guildId, newTTS)
    return newTTS
  }

  public async setLang(guildId: string, lang: string): Promise<VoiceLogSetStatus> {
    if (!this.lang.isExist(lang)) return VoiceLogSetStatus.MissingLang

    const data = await this.serverConfig.getOrCreate(guildId)

    if (data.lang === lang) return VoiceLogSetStatus.NotChanged

    await this.serverConfig.updateLang(guildId, lang)
    return VoiceLogSetStatus.LangSuccess
  }

  public async unsetVoiceLog(guildId: string) {
    await this.serverConfig.updateChannel(guildId, '')
  }
}
