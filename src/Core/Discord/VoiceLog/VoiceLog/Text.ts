import type { Client, Member, MessageContent, TextChannel, VoiceChannel } from 'eris'
import { vsprintf } from 'sprintf-js'
import type { ILogObj, Logger } from 'tslog'
import { instances } from '../../../../Utils/Instances'
import type { DbServerConfigManager } from '../../../MongoDB/db/ServerConfig'
import type { Discord } from '../../Core'
import type { VoiceLog } from '../VoiceLog'

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

  constructor(voiceLog: VoiceLog, discord: Discord) {
    this.client = discord.client
    this.logger = voiceLog.logger.getSubLogger({ name: 'Text' })
    this.serverConfig = voiceLog.serverConfig
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

  public async setLang(guildId: string, lang: string): Promise<VoiceLogSetStatus> {
    if (!instances.lang.isExist(lang)) return VoiceLogSetStatus.MissingLang

    const data = await this.serverConfig.getOrCreate(guildId)

    if (data.lang === lang) return VoiceLogSetStatus.NotChanged

    await this.serverConfig.updateLang(guildId, lang)
    return VoiceLogSetStatus.LangSuccess
  }

  public async unsetVoiceLog(guildId: string) {
    await this.serverConfig.updateChannel(guildId, '')
  }

  public genVoiceLogEmbed(member: Member, lang: string, type: string, oldChannel: VoiceChannel | undefined, newChannel: VoiceChannel | undefined) {
    let color: number
    let content: string
    switch (type) {
      case 'join':
        color = 4289797
        content = vsprintf(instances.lang.get(lang).display.voice_log.joined, [newChannel?.name])
        break
      case 'leave':
        color = 8454161
        content = vsprintf(instances.lang.get(lang).display.voice_log.left, [oldChannel?.name])
        break
      case 'move':
        color = 10448150
        content = vsprintf('%0s ▶️ %1s', [oldChannel?.name, newChannel?.name])
        break
      default:
        color = 6776679
        content = 'Unknown type'
        break
    }
    return {
      embed: {
        color,
        title: member.nick ? member.nick : member.username,
        description: content,
        timestamp: new Date().toISOString(),
        // biome-ignore lint/style/useNamingConvention: MessageContent requires this
        author: { name: '𝅺', icon_url: member.avatarURL }
      }
    } as MessageContent
  }
}
