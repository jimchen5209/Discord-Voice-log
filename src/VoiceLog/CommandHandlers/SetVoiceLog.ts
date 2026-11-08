import { vsprintf } from 'sprintf-js'
import type { CommandRequest } from '../../Platform/Command'
import { genErrorMessage, genNotChangedMessage, genSuccessMessage } from '../Embeds'
import { VoiceLogSetStatus } from '../Text'
import { beginCommand, type CommandDeps } from './Guard'

const ERR_MISSING_LANG_DEFAULT = 'Language not exist, will not change your language.'

export async function commandSetVoiceLog(deps: CommandDeps, request: CommandRequest) {
  const begun = await beginCommand(deps, request, 'manageMessages')
  if (!begun) return
  const { data } = begun

  const guild = request.guild
  const channelId = request.channelId
  const reply = request.reply

  if (!request.options?.language) {
    try {
      switch (await deps.voiceLog.text.setVoiceLog(guild, channelId)) {
        case VoiceLogSetStatus.NotChanged:
          await reply.send([genNotChangedMessage(deps.lang.get(data.lang).display.config.exist)], { private: true })
          return
        case VoiceLogSetStatus.ChannelSuccess:
          await reply.send([genSuccessMessage(deps.lang.get(data.lang).display.config.success)])
      }
    } catch {
      await reply.send([genErrorMessage(deps.lang.get(data.lang).display.config.error)], { private: true })
    }
  } else {
    const newLang = request.options.language as string

    try {
      switch (await deps.voiceLog.text.setVoiceLog(guild, channelId, newLang)) {
        case VoiceLogSetStatus.AllSuccess:
          await reply.send([
            genSuccessMessage(vsprintf(deps.lang.get(newLang).display.config.lang_success, [deps.lang.get(newLang).displayName])),
            genSuccessMessage(deps.lang.get(newLang).display.config.success)
          ])
          return
        case VoiceLogSetStatus.ChannelSuccess:
          await reply.send([genNotChangedMessage(vsprintf(deps.lang.get(data.lang).display.config.lang_exist, [deps.lang.get(data.lang).displayName]))], {
            private: true
          })
          await reply.send([genSuccessMessage(deps.lang.get(data.lang).display.config.success)])
          return
        case VoiceLogSetStatus.ChannelSuccessMissingLang:
          await reply.send([genErrorMessage(ERR_MISSING_LANG_DEFAULT)], { private: true })
          await reply.send([genSuccessMessage(deps.lang.get(data.lang).display.config.success)])
          return
        case VoiceLogSetStatus.LangSuccess:
          await reply.send([genSuccessMessage(vsprintf(deps.lang.get(newLang).display.config.lang_success, [deps.lang.get(newLang).displayName]))])
          await reply.send([genNotChangedMessage(deps.lang.get(newLang).display.config.exist)], { private: true })
          return
        case VoiceLogSetStatus.MissingLang:
          await reply.send([genErrorMessage(ERR_MISSING_LANG_DEFAULT), genNotChangedMessage(deps.lang.get(data.lang).display.config.exist)], { private: true })
          return
        case VoiceLogSetStatus.NotChanged:
          await reply.send(
            [
              genNotChangedMessage(vsprintf(deps.lang.get(data.lang).display.config.lang_exist, [deps.lang.get(data.lang).displayName])),
              genNotChangedMessage(deps.lang.get(data.lang).display.config.exist)
            ],
            { private: true }
          )
      }
    } catch {
      await reply.send([genErrorMessage(deps.lang.get(data.lang).display.config.error)], { private: true })
    }
  }
}
