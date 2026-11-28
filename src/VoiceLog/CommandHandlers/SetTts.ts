import type { IVoiceMessageTTS } from '../../Db/ServerConfig'
import { type CommandRequest, TTS_OPTION, TTS_OPTION_NAMES } from '../../Platform/Command'
import { genErrorMessage, genTTSSuccessMessage } from '../Embeds'
import { beginCommand, type CommandDeps, requireVoice } from './Guard'

const ERR_MISSING_LANG = 'Language not exist.'

export async function commandSetTTS(deps: CommandDeps, request: CommandRequest) {
  const begun = await beginCommand(deps, request, 'manageMessages')
  if (!begun) return
  if (!(await requireVoice(deps, request))) return
  const { data } = begun

  const options = request.options as Partial<Record<string, unknown>> | undefined
  if (!options) {
    await request.reply.send([genErrorMessage('Please provide at least one option to change.')], { private: true })
    return
  }
  // A client with the old command definition still sends `type` (now `provider`); refuse instead of a false success
  if (Object.keys(options).some((key) => !TTS_OPTION_NAMES.includes(key))) {
    await request.reply.send([genErrorMessage('Unknown option. Restart Discord to load the latest /voice tts command.')], { private: true })
    return
  }

  const ttsConfig: Partial<IVoiceMessageTTS> = {}
  const enabled = options[TTS_OPTION.enabled]
  const provider = options[TTS_OPTION.provider]
  const messageLang = options[TTS_OPTION.messageLang]
  const voiceLang = options[TTS_OPTION.voiceLang]
  const voiceName = options[TTS_OPTION.voiceName]
  if (typeof enabled === 'boolean') ttsConfig.enabled = enabled
  if (typeof provider === 'string') {
    const reason = deps.audio.unavailableReason(provider)
    if (reason) {
      // The reason can name config keys, so it only goes to the log
      deps.logger.warn(`Guild ${request.guild.guildId} cannot use TTS provider "${provider}": ${reason}`)
      await request.reply.send([genErrorMessage('This voice is currently unavailable.')], { private: true })
      return
    }
    ttsConfig.provider = provider
  }
  if (typeof messageLang === 'string') {
    if (!deps.lang.isExist(messageLang)) {
      await request.reply.send([genErrorMessage(ERR_MISSING_LANG)], { private: true })
      return
    }
    ttsConfig.messageLang = messageLang
  }
  if (typeof voiceLang === 'string') ttsConfig.voiceLang = voiceLang
  if (typeof voiceName === 'string') ttsConfig.voiceName = voiceName

  try {
    const updated = await deps.voiceLog.text.setVoiceMessageTTS(request.guild, ttsConfig)
    await request.reply.send([genTTSSuccessMessage(deps.lang, deps.lang.get(data.lang).display.config.tts_success, updated, data.lang)])
  } catch (error) {
    deps.logger.error('Failed to update TTS config', error)
    await request.reply.send([genErrorMessage(deps.lang.get(data.lang).display.config.error)], { private: true })
  }
}
