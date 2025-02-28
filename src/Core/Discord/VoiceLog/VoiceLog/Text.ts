import { Member, VoiceChannel, MessageContent, Client, TextChannel, Message, PossiblyUncachedTextableChannel } from 'eris'
import { ILogObj, Logger } from 'tslog'
import { vsprintf } from 'sprintf-js'
import { DbServerConfigManager } from '../../../MongoDB/db/ServerConfig'
import { Discord } from '../../Core'
import { instances } from '../../../../Utils/Instances'
import { VoiceLog } from '../VoiceLog'

const ERR_UNEXPECTED_LANG_STATUS = new Error('Unexpected lang set status')
const ERR_NO_PERMISSION = new Error('Not enough permissions to send message')

/* eslint-disable no-unused-vars -- definition*/
export enum VoiceLogSetStatus {
  AllSuccess,
  NotChanged,
  ChannelSuccess,
  LangSuccess,
  MissingLang,
  ChannelSuccess_MissingLang
}
/* eslint-enable no-unused-vars */

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
    const permissionCheck = ((this.client.getChannel(channelId)) as TextChannel).permissionsOf(this.client.user.id)
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
          return VoiceLogSetStatus.ChannelSuccess_MissingLang
        case VoiceLogSetStatus.NotChanged:
          return VoiceLogSetStatus.ChannelSuccess
        default:
          this.logger.error('Unexpected lang set status')
          throw ERR_UNEXPECTED_LANG_STATUS
      }

    } else {
      if (data.channelID === channelId) return VoiceLogSetStatus.NotChanged

      await this.serverConfig.updateChannel(guildId, channelId)
      return VoiceLogSetStatus.ChannelSuccess
    }
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
        timestamp: (new Date()).toISOString(),
        author: { name: '𝅺', icon_url: member.avatarURL }
      }
    } as MessageContent
  }

  public parseMessage(message: Message<PossiblyUncachedTextableChannel>, isContinuous: boolean, lang: string) {
    let content = ''
    const authorName = message.member?.nick || message.author.globalName || message.author.username

    // Poll
    if (message.poll !== undefined) {
      content = vsprintf('%s 傳送了一個投票', [authorName])
    }

    // Attachments
    if (message.attachments.length > 0) {
      content = vsprintf('%s 傳送了 %d 個附件', [authorName, message.attachments.length])
    }

    // Stickers
    if (message.stickerItems && message.stickerItems.length > 0) {
      const stickers = message.stickerItems.map((sticker) => vsprintf('[貼圖 %s]', [sticker.name])).join('、')
      if (content !== '') {
        content += vsprintf('，以及 %s', [stickers])
      } else {
        content = vsprintf('%s 傳送了 %s', [authorName, stickers])
      }
    }

    // Text
    if (message.content !== '' && content !== '') {
      content += vsprintf('，然後說：%s', [message.content])
    } else if (content === '') {
      if (!isContinuous) {
        content = vsprintf(instances.lang.get(lang).display.voice_tts.message, [authorName, message.content])
      } else {
        content = message.content
      }
    }

    // Emoji
    content = content.replace(/<:([a-zA-Z0-9_]+):\d+>/g, vsprintf('[表情符號 %s]', ['$1']))

    // Mention Channel
    if (message.channelMentions.length > 0) {
      for (const channelId of message.channelMentions) {
        const channel = message.member?.guild.channels.get(channelId)
        content = content.replace(`<#${channelId}>`, channel ? vsprintf('[頻道 %s]', [channel.name]) : '[不明頻道]')
      }
    }

    // Mention Role
    if (message.roleMentions.length > 0) {
      for (const roleId of message.roleMentions) {
        const role = message.member?.guild.roles.get(roleId)
        content = content.replace(`<@&${roleId}>`, vsprintf('[身分組 %s]', [role?.name]))
      }
    }

    // Mention User
    if (message.mentions.length > 0) {
      for (const user of message.mentions) {
        const member = message.member?.guild.members.get(user.id)
        content = content.replace(`<@${user.id}>`, `@${member?.nick || user.globalName || user.username}`)
      }
    }

    // Url
    content = content.replace(/https?:\/\/(www\.)?([^/\s]+)(\/[^\s]*)?/g, vsprintf('[連結 %s]', ['$2']))

    return content
  }
}
