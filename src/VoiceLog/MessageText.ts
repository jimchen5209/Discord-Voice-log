import type { Client, Message, PossiblyUncachedTextableChannel, TextableChannel } from '@projectdysnomia/dysnomia'
import { vsprintf } from 'sprintf-js'
import type { ILogObj, Logger } from 'tslog'
import { instances } from '../App/App'

export function parseMessage(
  client: Client,
  logger: Logger<ILogObj>,
  message: Message<PossiblyUncachedTextableChannel>,
  isContinuous: boolean,
  lang: string,
  isForward = false
): string {
  if (message.member?.id === client.user.id) {
    logger.debug('Skipped message from self')
    return ''
  }
  let content = ''
  const authorName = isForward ? '' : message.member?.nick || message.author.globalName || message.author.username
  const guild = message.guildID ? client.guilds.get(message.guildID) : undefined

  if (message.poll !== undefined) {
    // Poll
    content = instances.lang.get(lang).display.voice_tts.attachment_poll
  }

  if (message.attachments.size > 0) {
    // Attachments
    if (message.attachments.size === 1) {
      content = vsprintf(instances.lang.get(lang).display.voice_tts.attachment_single, [message.attachments.size])
    } else {
      content = vsprintf(instances.lang.get(lang).display.voice_tts.attachment_multiple, [message.attachments.size])
    }
  }

  if (message.stickerItems && message.stickerItems.length > 0) {
    // Stickers
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

  if (message.messageSnapshots && message.messageSnapshots.length > 0) {
    // Forward
    const forwardContent = message.messageSnapshots
      .map((snapshot) => {
        return parseMessage(client, logger, snapshot.message as unknown as Message<TextableChannel>, true, lang, true)
      })
      .join(instances.lang.get(lang).display.voice_tts.multi_item_separator)
    if (message.messageSnapshots.length === 1) {
      content = vsprintf(instances.lang.get(lang).display.voice_tts.forward_single, [message.messageSnapshots.length, forwardContent])
    } else {
      content = vsprintf(instances.lang.get(lang).display.voice_tts.forward_multiple, [message.messageSnapshots.length, forwardContent])
    }
  }

  if (content !== '') {
    // Text
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
  content = content.replace(/<a?:([a-zA-Z0-9_]+):\d+>/g, vsprintf(instances.lang.get(lang).display.voice_tts.message_emoji, ['$1']))

  if (message.channelMentions.length > 0) {
    // Mention Channel
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

  if (message.roleMentions.length > 0) {
    // Mention Role
    for (const roleId of message.roleMentions) {
      logger.debug(`Role ID: ${roleId}`)
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

  if (message.mentions.length > 0) {
    // Mention User
    for (const user of message.mentions) {
      const member = guild?.members.get(user.id)
      content = content.replace(`<@${user.id}>`, `@${member?.nick || user.globalName || user.username}`)
    }
  }

  if (message.activity && message.activity.type === 6) {
    // Stream Request
    content = vsprintf(instances.lang.get(lang).display.voice_tts.stream_request, [content, message.activity.name_override])
  }

  // Url
  content = content.replace(/https?:\/\/(www\.)?([^/\s]+)(\/[^\s]*)?/g, vsprintf(instances.lang.get(lang).display.voice_tts.message_link, ['$2']))

  return content
}
