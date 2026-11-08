import type { IVoiceMessageTTS } from '../../Db/ServerConfig'
import type { CommandRequest } from '../../Platform/Command'
import { genErrorMessage, genTTSSuccessMessage } from '../Embeds'
import { beginCommand, type CommandDeps } from './Guard'

const ERR_MISSING_LANG = 'Language not exist.'
// Keep in sync with the tts options in SlashCommands/Voice.ts, or a new option gets refused
const KNOWN_OPTIONS = new Set(['enabled', 'provider', 'message_lang', 'voice_lang', 'voice_name'])

export async function commandSetTTS(deps: CommandDeps, request: CommandRequest) {
  const begun = await beginCommand(deps, request, 'manageMessages')
  if (!begun) return
  const { data } = begun

  const options = request.options as Partial<Record<string, unknown>> | undefined
  if (!options) {
    await request.reply.send([genErrorMessage('Please provide at least one option to change.')], { private: true })
    return
  }
  // A client with the old command definition still sends `type` (now `provider`); refuse instead of a false success
  if (Object.keys(options).some((key) => !KNOWN_OPTIONS.has(key))) {
    await request.reply.send([genErrorMessage('Unknown option. Restart Discord to load the latest /voice tts command.')], { private: true })
    return
  }

  const ttsConfig: Partial<IVoiceMessageTTS> = {}
  if (typeof options.enabled === 'boolean') ttsConfig.enabled = options.enabled
  if (typeof options.provider === 'string') {
    const reason = deps.audio.unavailableReason(options.provider)
    if (reason) {
      // The reason can name config keys, so it only goes to the log
      deps.logger.warn(`Guild ${request.guild.guildId} cannot use TTS provider "${options.provider}": ${reason}`)
      await request.reply.send([genErrorMessage('This voice is currently unavailable.')], { private: true })
      return
    }
    ttsConfig.provider = options.provider
  }
  if (typeof options.message_lang === 'string') {
    if (!deps.lang.isExist(options.message_lang)) {
      await request.reply.send([genErrorMessage(ERR_MISSING_LANG)], { private: true })
      return
    }
    ttsConfig.messageLang = options.message_lang
  }
  if (typeof options.voice_lang === 'string') ttsConfig.voiceLang = options.voice_lang
  if (typeof options.voice_name === 'string') ttsConfig.voiceName = options.voice_name

  try {
    const updated = await deps.voiceLog.text.setVoiceMessageTTS(request.guild, ttsConfig)
    await request.reply.send([genTTSSuccessMessage(deps.lang, deps.lang.get(data.lang).display.config.tts_success, updated, data.lang)])
  } catch (error) {
    deps.logger.error('Failed to update TTS config', error)
    await request.reply.send([genErrorMessage(deps.lang.get(data.lang).display.config.error)], { private: true })
  }
}
