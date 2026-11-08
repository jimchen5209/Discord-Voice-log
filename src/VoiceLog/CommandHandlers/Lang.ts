import { vsprintf } from 'sprintf-js'
import type { CommandRequest } from '../../Platform/Command'
import { genErrorMessage, genNotChangedMessage, genSuccessMessage } from '../Embeds'
import { VoiceLogSetStatus } from '../Text'
import { beginCommand, type CommandDeps } from './Guard'

const ERR_MISSING_LANG = 'Language not exist.'

export async function commandLang(deps: CommandDeps, request: CommandRequest) {
  const begun = await beginCommand(deps, request, 'manageMessages')
  if (!begun) return
  const { data } = begun

  const newLang = request.options?.language as string

  switch (await deps.voiceLog.text.setLang(request.guild, newLang)) {
    case VoiceLogSetStatus.LangSuccess:
      await request.reply.send([genSuccessMessage(vsprintf(deps.lang.get(newLang).display.config.lang_success, [deps.lang.get(newLang).displayName]))])
      return
    case VoiceLogSetStatus.MissingLang:
      await request.reply.send([genErrorMessage(ERR_MISSING_LANG)], { private: true })
      return
    case VoiceLogSetStatus.NotChanged:
      await request.reply.send([genNotChangedMessage(vsprintf(deps.lang.get(data.lang).display.config.lang_exist, [deps.lang.get(data.lang).displayName]))], {
        private: true
      })
      return
    default:
      await request.reply.send([genErrorMessage(deps.lang.get(data.lang).display.config.error)], { private: true })
  }
}
