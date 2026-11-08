import { vsprintf } from 'sprintf-js'
import type { ILogObj, Logger } from 'tslog'
import type { MessageView } from '../Platform/Views'
import type { Lang } from '../Shared/Lang'

export function parseMessage(logger: Logger<ILogObj>, message: MessageView, isContinuous: boolean, lang: string, i18n: Lang, isForward = false): string {
  if (message.fromSelf) {
    logger.debug('Skipped message from self')
    return ''
  }
  let content = ''
  const authorName = isForward ? '' : message.authorName

  if (message.hasPoll) {
    // Poll
    content = i18n.get(lang).display.voice_tts.attachment_poll
  }

  if (message.attachmentCount > 0) {
    // Attachments
    if (message.attachmentCount === 1) {
      content = vsprintf(i18n.get(lang).display.voice_tts.attachment_single, [message.attachmentCount])
    } else {
      content = vsprintf(i18n.get(lang).display.voice_tts.attachment_multiple, [message.attachmentCount])
    }
  }

  if (message.stickerNames.length > 0) {
    // Stickers
    const stickers = message.stickerNames
      .map((name) => vsprintf(i18n.get(lang).display.voice_tts.message_sticker, [name]))
      .join(i18n.get(lang).display.voice_tts.multi_item_separator)
    if (content !== '') {
      if (message.content !== '') {
        content = [content, stickers].join(i18n.get(lang).display.voice_tts.multi_item_separator)
      } else {
        content = vsprintf(i18n.get(lang).display.voice_tts.multi_item_last_separator, [content, stickers])
      }
    } else {
      content = stickers
    }
  }

  if (message.forwarded.length > 0) {
    // Forward
    const forwardContent = message.forwarded.map((forwarded) => parseMessage(logger, forwarded, true, lang, i18n, true)).join(i18n.get(lang).display.voice_tts.multi_item_separator)
    if (message.forwarded.length === 1) {
      content = vsprintf(i18n.get(lang).display.voice_tts.forward_single, [message.forwarded.length, forwardContent])
    } else {
      content = vsprintf(i18n.get(lang).display.voice_tts.forward_multiple, [message.forwarded.length, forwardContent])
    }
  }

  if (content !== '') {
    // Text
    if (message.content !== '') {
      const text = vsprintf(i18n.get(lang).display.voice_tts.attachment_text, [message.content])
      content = vsprintf(i18n.get(lang).display.voice_tts.multi_item_last_separator, [content, text])
    }
    content = isForward ? content : vsprintf(i18n.get(lang).display.voice_tts.attachment_message, [authorName, content])
  } else if (content === '') {
    const text = message.content.length !== 0 ? message.content : i18n.get(lang).display.voice_tts.message_unknown
    if (!isContinuous && !isForward) {
      content = vsprintf(i18n.get(lang).display.voice_tts.text_message, [authorName, text])
    } else {
      content = text
    }
  }

  // Emoji
  content = content.replace(/<a?:([a-zA-Z0-9_]+):\d+>/g, vsprintf(i18n.get(lang).display.voice_tts.message_emoji, ['$1']))

  if (message.channelMentions.length > 0) {
    // Mention Channel
    for (const channel of message.channelMentions) {
      let channelText = ''
      if (channel.name !== undefined) {
        channelText = vsprintf(i18n.get(lang).display.voice_tts.message_channel_mention, [channel.name])
      } else {
        channelText = i18n.get(lang).display.voice_tts.message_channel_mention_unknown
      }
      content = content.replace(`<#${channel.id}>`, channelText)
    }
  }

  if (message.roleMentions.length > 0) {
    // Mention Role
    for (const role of message.roleMentions) {
      logger.debug(`Role ID: ${role.id}`)
      let roleText = ''
      if (role.name !== undefined) {
        roleText = vsprintf(i18n.get(lang).display.voice_tts.message_role_mention, [role.name])
      } else {
        roleText = i18n.get(lang).display.voice_tts.message_role_mention_unknown
      }
      content = content.replace(`<@&${role.id}>`, roleText)
    }
  }

  if (message.userMentions.length > 0) {
    // Mention User
    for (const user of message.userMentions) {
      content = content.replace(`<@${user.id}>`, `@${user.name}`)
    }
  }

  if (message.streamRequest) {
    // Stream Request
    content = vsprintf(i18n.get(lang).display.voice_tts.stream_request, [content, message.streamRequest.name])
  }

  // Url
  content = content.replace(/https?:\/\/(www\.)?([^/\s]+)(\/[^\s]*)?/g, vsprintf(i18n.get(lang).display.voice_tts.message_link, ['$2']))

  return content
}
