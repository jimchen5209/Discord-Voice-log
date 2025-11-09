import type { Client, Member, Message, MessageContent, PossiblyUncachedTextableChannel, TextableChannel, TextChannel, VoiceChannel } from 'eris'
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

  public parseMessage(message: Message<PossiblyUncachedTextableChannel>, isContinuous: boolean, lang: string, isForward = false): string {
    let content = ''
    const authorName = isForward ? '' : message.member?.nick || message.author.globalName || message.author.username
    const guild = message.guildID ? this.client.guilds.get(message.guildID) : undefined

    // Poll
    if (message.poll !== undefined) {
      content = instances.lang.get(lang).display.voice_tts.attachment_poll
    }

    // Attachments
    if (message.attachments.length > 0) {
      if (message.attachments.length === 1) {
        content = vsprintf(instances.lang.get(lang).display.voice_tts.attachment_single, [message.attachments.length])
      } else {
        content = vsprintf(instances.lang.get(lang).display.voice_tts.attachment_multiple, [message.attachments.length])
      }
    }

    // Stickers
    if (message.stickerItems && message.stickerItems.length > 0) {
      const stickers = message.stickerItems
        .map((sticker) => vsprintf(instances.lang.get(lang).display.voice_tts.message_sticker, [sticker.name]))
        .join(instances.lang.get(lang).display.voice_tts.multi_item_separator)
      if (content !== '') {
        if (message.content !== '') {
          content = [content, stickers].join(instances.lang.get(lang).display.voice_tts.multi_item_separator)
        } else {
          content = vsprintf(instances.lang.get(lang).display.voice_tts.multi_item_last_separator, [content, stickers])
        }
      } else {
        content = stickers
      }
    }

    // Forward
    if (message.messageSnapshots && message.messageSnapshots.length > 0) {
      const forwardContent = message.messageSnapshots
        .map((snapshot) => {
          return this.parseMessage(snapshot.message as unknown as Message<TextableChannel>, true, lang, true)
        })
        .join(instances.lang.get(lang).display.voice_tts.multi_item_separator)
      if (message.messageSnapshots.length === 1) {
        content = vsprintf(instances.lang.get(lang).display.voice_tts.forward_single, [message.messageSnapshots.length, forwardContent])
      } else {
        content = vsprintf(instances.lang.get(lang).display.voice_tts.forward_multiple, [message.messageSnapshots.length, forwardContent])
      }
    }

    // Text
    if (content !== '') {
      if (message.content !== '') {
        const text = vsprintf(instances.lang.get(lang).display.voice_tts.attachment_text, [message.content])
        content = vsprintf(instances.lang.get(lang).display.voice_tts.multi_item_last_separator, [content, text])
      }
      content = isForward ? content : vsprintf(instances.lang.get(lang).display.voice_tts.attachment_message, [authorName, content])
    } else if (content === '') {
      const text = message.content.length !== 0 ? message.content : instances.lang.get(lang).display.voice_tts.message_unknown
      if (!isContinuous && !isForward) {
        content = vsprintf(instances.lang.get(lang).display.voice_tts.text_message, [authorName, text])
      } else {
        content = text
      }
    }

    // Emoji
    content = content.replace(/<:([a-zA-Z0-9_]+):\d+>/g, vsprintf(instances.lang.get(lang).display.voice_tts.message_emoji, ['$1']))

    // Mention Channel
    if (message.channelMentions.length > 0) {
      for (const channelId of message.channelMentions) {
        const channel = guild?.channels.get(channelId)
        let channelText = ''
        if (channel) {
          channelText = vsprintf(instances.lang.get(lang).display.voice_tts.message_channel_mention, [channel.name])
        } else {
          channelText = instances.lang.get(lang).display.voice_tts.message_channel_mention_unknown
        }
        content = content.replace(`<#${channelId}>`, channelText)
      }
    }

    // Mention Role
    if (message.roleMentions.length > 0) {
      for (const roleId of message.roleMentions) {
        this.logger.debug(`Role ID: ${roleId}`)
        const role = guild?.roles.get(roleId)
        let roleText = ''
        if (role) {
          roleText = vsprintf(instances.lang.get(lang).display.voice_tts.message_role_mention, [role.name])
        } else {
          roleText = instances.lang.get(lang).display.voice_tts.message_role_mention_unknown
        }
        content = content.replace(`<@&${roleId}>`, roleText)
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
    content = content.replace(/https?:\/\/(www\.)?([^/\s]+)(\/[^\s]*)?/g, vsprintf(instances.lang.get(lang).display.voice_tts.message_link, ['$2']))

    return content
  }
}
