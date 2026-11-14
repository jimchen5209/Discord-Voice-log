// Fluxer bots have no slash commands, so a command is a message that starts with a mention of the bot:
// "@Bot <group> <command> [arguments]". Same commands and options as the Discord slash commands. Pure: parsing only.
import { type CommandName, TTS_OPTION, TTS_OPTION_NAMES } from '../Platform/Command'
import type { Embed } from '../Platform/Embed'

export type ParsedCommand = { kind: 'command'; name: CommandName; options?: Record<string, unknown> } | { kind: 'help' } | { kind: 'invalid'; error: string }

const TRUE_WORDS = ['true', 'on', 'yes']
const FALSE_WORDS = ['false', 'off', 'no']

// The text after the mention when the message starts with <@selfId> or <@!selfId>, then whitespace or the end;
// undefined otherwise, or before the bot knows its id. Such a message is never logged or read aloud.
export function commandText(content: string, selfId: string): string | undefined {
  if (!selfId) return undefined
  const text = content.trimStart()
  for (const mention of [`<@${selfId}>`, `<@!${selfId}>`]) {
    if (!text.startsWith(mention)) continue
    const rest = text.slice(mention.length)
    if (rest === '' || /^\s/.test(rest)) return rest.trim()
  }
  return undefined
}

export function isCommand(content: string, selfId: string) {
  return commandText(content, selfId) !== undefined
}

function noArguments(name: CommandName, args: string[]): ParsedCommand {
  if (args.length > 0) return { kind: 'invalid', error: `Unexpected argument "${args[0]}"` }
  return { kind: 'command', name }
}

// voice tts key=value ...; with none, the current settings are shown as with /voice tts
function parseTts(args: string[]): ParsedCommand {
  const options: Record<string, unknown> = {}
  for (const arg of args) {
    const separator = arg.indexOf('=')
    const key = separator > 0 ? arg.slice(0, separator) : ''
    const value = arg.slice(separator + 1)
    if (!TTS_OPTION_NAMES.includes(key) || value === '') return { kind: 'invalid', error: `"${arg}" is not one of ${TTS_OPTION_NAMES.map((option) => `${option}=...`).join(', ')}` }
    if (key === TTS_OPTION.enabled) {
      const word = value.toLowerCase()
      if (TRUE_WORDS.includes(word)) options[TTS_OPTION.enabled] = true
      else if (FALSE_WORDS.includes(word)) options[TTS_OPTION.enabled] = false
      else return { kind: 'invalid', error: `${TTS_OPTION.enabled} must be true or false, not "${value}"` }
    } else {
      options[key] = value
    }
  }
  return { kind: 'command', name: 'voice.tts', options }
}

// Undefined when the message is not a command
export function parseCommand(content: string, selfId: string): ParsedCommand | undefined {
  const text = commandText(content, selfId)
  if (text === undefined) return undefined
  const [group, command, ...args] = text.split(/\s+/).filter(Boolean)
  switch (group?.toLowerCase()) {
    case undefined:
    case 'help':
      return { kind: 'help' }
    case 'voice':
      switch (command?.toLowerCase()) {
        case 'join':
          return noArguments('voice.join', args)
        case 'leave':
          return noArguments('voice.leave', args)
        case 'tts':
          return parseTts(args)
      }
      return { kind: 'invalid', error: 'Use voice join, voice leave or voice tts' }
    case 'log':
      switch (command?.toLowerCase()) {
        case 'set':
          if (args.length > 1) return { kind: 'invalid', error: `Unexpected argument "${args[1]}"` }
          return { kind: 'command', name: 'log.set', options: args[0] ? { language: args[0] } : undefined }
        case 'unset':
          return noArguments('log.unset', args)
        case 'language':
          if (args.length !== 1) return { kind: 'invalid', error: 'Give one language, e.g. log language en_US' }
          return { kind: 'command', name: 'log.language', options: { language: args[0] } }
      }
      return { kind: 'invalid', error: 'Use log set, log unset or log language' }
    case 'refresh_cache':
      return noArguments('refresh_cache', command ? [command, ...args] : [])
  }
  return { kind: 'invalid', error: `Unknown command "${group}"` }
}

// trigger: the label shown before each command, e.g. "@VoiceLog"; languages: [key, display name]
export function genHelpEmbed(trigger: string, languages: [string, string][], providerIds: string[], error?: string): Embed {
  const lines = [
    `\`${trigger} log set [language]\`: Set and enable voiceLog in this channel (admin)`,
    `\`${trigger} log unset\`: Disable voiceLog (admin)`,
    `\`${trigger} log language <language>\`: Set voiceLog language (admin)`,
    `\`${trigger} voice join\`: Make bot join your channel (admin)`,
    `\`${trigger} voice leave\`: Make bot leave channel (admin)`,
    `\`${trigger} voice tts ${TTS_OPTION_NAMES.map((name) => (name === TTS_OPTION.enabled ? `[${name}=true|false]` : `[${name}=...]`)).join(' ')}\`: Voice Message TTS setting (admin)`,
    `\`${trigger} refresh_cache\`: Refresh TTS caches (bot admin)`
  ]
  return {
    title: error ? 'Invalid command' : 'VoiceLog commands',
    color: error ? 13632027 : 9274675,
    description: [...(error ? [error, ''] : []), ...lines].join('\n'),
    fields: [
      { name: 'Languages', value: languages.map(([key, name]) => `\`${key}\` ${name}`).join('\n') || '-' },
      { name: 'TTS providers', value: providerIds.map((id) => `\`${id}\``).join(', ') || '-' }
    ]
  }
}
