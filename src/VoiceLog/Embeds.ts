import type { Member, MessageContent, VoiceChannel } from '@projectdysnomia/dysnomia'
import type { MessageEmbedOptions } from 'slash-create'
import { vsprintf } from 'sprintf-js'
import type { IVoiceMessageTTS } from '../Db/ServerConfig'
import type { Lang } from '../Shared/Lang'

export function genSuccessMessage(msg: string) {
  return {
    title: 'Success',
    color: 4289797,
    description: msg
  } as MessageEmbedOptions
}

export function genNotChangedMessage(msg: string) {
  return {
    title: 'Nothing Changed',
    color: 9274675,
    description: msg
  } as MessageEmbedOptions
}

export function genErrorMessage(msg: string) {
  return {
    title: 'Error',
    color: 13632027,
    description: msg
  } as MessageEmbedOptions
}

export function genTTSSuccessMessage(i18n: Lang, title: string, ttsConfig: IVoiceMessageTTS, lang: string) {
  const l = i18n.get(lang).display.config
  const translatedFields = [
    { label: l.tts_enabled, value: ttsConfig.enabled ? l.tts_yes : l.tts_no },
    { label: l.tts_message_lang, value: ttsConfig.messageLang },
    { label: l.tts_type, value: ttsConfig.provider },
    { label: l.tts_voice_lang, value: ttsConfig.voiceLang },
    { label: l.tts_voice_name, value: ttsConfig.voiceName }
  ]
  const description = translatedFields.map((f) => `**${f.label}**: ${f.value}`).join('\n')
  return {
    title,
    color: 4289797,
    description
  } as MessageEmbedOptions
}

export function genVoiceLogEmbed(i18n: Lang, member: Member, lang: string, type: string, oldChannel: VoiceChannel | undefined, newChannel: VoiceChannel | undefined) {
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
    embeds: [
      {
        color,
        title: member.nick ? member.nick : member.username,
        description: content,
        timestamp: new Date().toISOString(),
        // biome-ignore lint/style/useNamingConvention: MessageContent requires this
        author: { name: `@${member.username}`, icon_url: member.avatarURL }
      }
    ]
  } as MessageContent<'hasNonce'>
}

export function genProgressMessage(title: string, fields: Array<{ name: string; value: string }>, isDone = false) {
  return {
    color: isDone ? 4289797 : 16312092,
    title,
    fields
  } as MessageEmbedOptions
}
