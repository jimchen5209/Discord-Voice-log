import { vsprintf } from 'sprintf-js'
import type { IVoiceMessageTTS } from '../Db/ServerConfig'
import type { Embed } from '../Platform/Embed'
import type { ChannelView, MemberView } from '../Platform/Views'
import type { Lang } from '../Shared/Lang'

export function genSuccessMessage(msg: string): Embed {
  return {
    title: 'Success',
    color: 4289797,
    description: msg
  }
}

export function genNotChangedMessage(msg: string): Embed {
  return {
    title: 'Nothing Changed',
    color: 9274675,
    description: msg
  }
}

export function genErrorMessage(msg: string): Embed {
  return {
    title: 'Error',
    color: 13632027,
    description: msg
  }
}

export function genTTSSuccessMessage(i18n: Lang, title: string, ttsConfig: IVoiceMessageTTS, lang: string): Embed {
  const l = i18n.get(lang).display.config
  const translatedFields = [
    { label: l.tts_enabled, value: ttsConfig.enabled ? l.tts_yes : l.tts_no },
    { label: l.tts_message_lang, value: ttsConfig.messageLang },
    { label: l.tts_provider, value: ttsConfig.provider },
    { label: l.tts_voice_lang, value: ttsConfig.voiceLang },
    { label: l.tts_voice_name, value: ttsConfig.voiceName }
  ]
  const description = translatedFields.map((f) => `**${f.label}**: ${f.value}`).join('\n')
  return {
    title,
    color: 4289797,
    description
  }
}

export function genVoiceLogEmbed(i18n: Lang, member: MemberView, lang: string, type: string, oldChannel: ChannelView | undefined, newChannel: ChannelView | undefined): Embed {
  let color: number
  let content: string
  switch (type) {
    case 'join':
      color = 4289797
      content = vsprintf(i18n.get(lang).display.voice_log.joined, [newChannel?.name])
      break
    case 'leave':
      color = 8454161
      content = vsprintf(i18n.get(lang).display.voice_log.left, [oldChannel?.name])
      break
    case 'move':
      color = 10448150
      content = vsprintf('%0s ▶ %1s', [oldChannel?.name, newChannel?.name])
      break
    default:
      color = 6776679
      content = 'Unknown type'
      break
  }
  return {
    color,
    title: member.displayName,
    description: content,
    timestamp: new Date().toISOString(),
    author: { name: `@${member.username}`, iconUrl: member.avatarUrl }
  }
}

export function genProgressMessage(title: string, fields: Array<{ name: string; value: string }>, isDone = false): Embed {
  return {
    color: isDone ? 4289797 : 16312092,
    title,
    fields
  }
}
