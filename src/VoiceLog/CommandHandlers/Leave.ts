import type { CommandRequest } from '../../Platform/Command'
import { genNotChangedMessage, genSuccessMessage } from '../Embeds'
import { beginCommand, type CommandDeps } from './Guard'

export async function commandLeave(deps: CommandDeps, request: CommandRequest) {
  const begun = await beginCommand(deps, request, 'manageMessages')
  if (!begun) return
  const { data } = begun
  const guild = request.guild

  const voice = deps.voiceLog.voice.getCurrentVoice(guild)

  if (voice) {
    await deps.voiceLog.voice.destroy(guild, true)
    await request.reply.send([genSuccessMessage(deps.lang.get(data.lang).display.command.leave_success)])
  } else {
    await request.reply.send([genNotChangedMessage(deps.lang.get(data.lang).display.command.bot_not_connected)], { private: true })
  }
}
