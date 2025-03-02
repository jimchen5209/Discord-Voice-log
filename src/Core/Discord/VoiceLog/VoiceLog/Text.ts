import { Member, VoiceChannel, MessageContent, Client, TextChannel, Message, PossiblyUncachedTextableChannel, TextableChannel } from 'eris'
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

  public parseMessage(message: Message<PossiblyUncachedTextableChannel>, isContinuous: boolean, lang: string, isForward = false): string {
    let content = ''
    const authorName = (isForward) ? '' : message.member?.nick || message.author.globalName || message.author.username
    const guild = message.guildID ? this.client.guilds.get(message.guildID) : undefined

    // Poll
    if (message.poll !== undefined) {
      content = '一個投票'
    }

    // Attachments
    if (message.attachments.length > 0) {
      content = vsprintf('%d 個附件', [message.attachments.length])
    }

    // Stickers
    if (message.stickerItems && message.stickerItems.length > 0) {
      const stickers = message.stickerItems.map((sticker) => vsprintf('[貼圖 %s]', [sticker.name])).join('、')
      if (content !== '') {
        content = message.content !== '' ? [content, stickers].join('、') : vsprintf('%1s，以及%2s', [content, stickers])
      } else {
        content = stickers
      }
    }

    // Forward
    if (message.messageSnapshots && message.messageSnapshots.length > 0) {
      const forwardContent = message.messageSnapshots.map((snapshot) => {
        return this.parseMessage(snapshot.message as unknown as Message<TextableChannel>, true, lang, true)
      }).join('；')
      content = vsprintf('%d 則轉發訊息，內容為：%s', [message.messageSnapshots.length, forwardContent])
    }

    // Text
    if (content !== '') {
      if (message.content !== '') {
        const text = vsprintf('文字內容：%s', [message.content])
        content = vsprintf('%1s，以及%2s', [content, text])
      }
      content = isForward ? content : vsprintf('%1s 傳送了 %2s', [authorName, content])
    } else if (content === '') {
      const text = (message.content.length !== 0) ? message.content : '[不明訊息]'
      if (!isContinuous && !isForward) {
        content = vsprintf(instances.lang.get(lang).display.voice_tts.message, [authorName, text])
      } else {
        content = text
      }
    }

    // Emoji
    content = content.replace(/<:([a-zA-Z0-9_]+):\d+>/g, vsprintf('[表情符號 %s]', ['$1']))

    // Mention Channel
    if (message.channelMentions.length > 0) {
      for (const channelId of message.channelMentions) {
        const channel = guild?.channels.get(channelId)
        content = content.replace(`<#${channelId}>`, channel ? vsprintf('#[頻道 %s]', [channel.name]) : '#[不明頻道]')
      }
    }

    // Mention Role
    if (message.roleMentions.length > 0) {
      for (const roleId of message.roleMentions) {
        this.logger.debug(`Role ID: ${roleId}`)
        const role = guild?.roles.get(roleId)
        content = content.replace(`<@&${roleId}>`, role ? vsprintf('@[身分組 %s]', [role.name]) : '@[不明身分組]')
      }
    }

    // Mention User
    if (message.mentions.length > 0) {
      for (const user of message.mentions) {
        const member = guild?.members.get(user.id)
        content = content.replace(`<@${user.id}>`, `@${member?.nick || user.globalName || user.username}`)
      }
    }

    // Url
    content = content.replace(/https?:\/\/(www\.)?([^/\s]+)(\/[^\s]*)?/g, vsprintf('[連結 %s]', ['$2']))

    return content
  }
}
