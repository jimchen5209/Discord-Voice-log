import type { CommandContext } from 'slash-create'
import { genSuccessMessage } from '../Embeds'
import { beginCommand, type CommandDeps } from './Guard'

export async function commandUnsetVoiceLog(deps: CommandDeps, context: CommandContext) {
  const begun = await beginCommand(deps, context, 'manageMessages')
  if (!begun) return
  const { member, data } = begun

  await deps.voiceLog.text.unsetVoiceLog(member.guild.id)
  await context.send({
    embeds: [genSuccessMessage(deps.lang.get(data.lang).display.config.unset_success)]
  })
}
