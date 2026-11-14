import type { CommandRequest } from '../../Platform/Command'
import { genSuccessMessage } from '../Embeds'
import { beginCommand, type CommandDeps } from './Guard'

export async function commandUnsetVoiceLog(deps: CommandDeps, request: CommandRequest) {
  const begun = await beginCommand(deps, request, 'manageMessages')
  if (!begun) return
  const { data } = begun

  await deps.voiceLog.text.unsetVoiceLog(request.guild)
  await request.reply.send([genSuccessMessage(deps.lang.get(data.lang).display.config.unset_success)])
}
