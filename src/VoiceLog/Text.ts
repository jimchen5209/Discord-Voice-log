import type { ILogObj, Logger } from 'tslog'
import type { DbServerConfigManager, IVoiceMessageTTS } from '../Db/ServerConfig'
import type { GuildKey } from '../Platform/Scope'
import type { TextOutput } from '../Platform/TextOutput'
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
  private output: TextOutput
  private logger: Logger<ILogObj>
  private serverConfig: DbServerConfigManager
  private lang: Lang

  constructor(voiceLog: VoiceLog, output: TextOutput, lang: Lang) {
    this.output = output
    this.logger = voiceLog.logger.getSubLogger({ name: 'Text' })
    this.serverConfig = voiceLog.serverConfig
    this.lang = lang
  }

  public async setVoiceLog(guild: GuildKey, channelId: string, lang: string | undefined = undefined): Promise<VoiceLogSetStatus> {
    if (!this.output.canSendEmbeds({ scope: guild, channelId })) {
      this.logger.error('Not enough permissions to send message')
      throw ERR_NO_PERMISSION
    }

    const data = await this.serverConfig.getOrCreate(guild)
    if (lang) {
      if (data.channelID === channelId && data.lang === lang) return VoiceLogSetStatus.NotChanged
      if (data.channelID === channelId) {
        return await this.setLang(guild, lang)
      }
      await this.serverConfig.updateChannel(guild, channelId)
      switch (await this.setLang(guild, lang)) {
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

    await this.serverConfig.updateChannel(guild, channelId)
    return VoiceLogSetStatus.ChannelSuccess
  }

  public async setVoiceMessageTTS(guild: GuildKey, ttsConfig: Partial<IVoiceMessageTTS>): Promise<IVoiceMessageTTS> {
    const data = await this.serverConfig.getOrCreate(guild)
    const newTTS = { ...data.voiceMessageTTS, ...ttsConfig }
    await this.serverConfig.updateVoiceMessageTTS(guild, newTTS)
    return newTTS
  }

  public async setLang(guild: GuildKey, lang: string): Promise<VoiceLogSetStatus> {
    if (!this.lang.isExist(lang)) return VoiceLogSetStatus.MissingLang

    const data = await this.serverConfig.getOrCreate(guild)

    if (data.lang === lang) return VoiceLogSetStatus.NotChanged

    await this.serverConfig.updateLang(guild, lang)
    return VoiceLogSetStatus.LangSuccess
  }

  public async unsetVoiceLog(guild: GuildKey) {
    await this.serverConfig.updateChannel(guild, '')
  }
}
