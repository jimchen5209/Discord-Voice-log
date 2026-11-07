import type { CommandContext } from 'slash-create'
import { genNotChangedMessage, genSuccessMessage } from '../Embeds'
import { beginCommand, type CommandDeps } from './Guard'

export async function commandLeave(deps: CommandDeps, context: CommandContext) {
  const begun = await beginCommand(deps, context, 'manageMessages')
  if (!begun) return
  const { member, data } = begun
  const guildId = member.guild.id

  const voice = deps.voiceLog.voice.getCurrentVoice(guildId)

  if (voice) {
    await deps.voiceLog.voice.destroy(guildId, true)
    await context.send({
      embeds: [genSuccessMessage(deps.lang.get(data.lang).display.command.leave_success)]
    })
  } else {
    await context.send({
      embeds: [genNotChangedMessage(deps.lang.get(data.lang).display.command.bot_not_connected)],
      ephemeral: true
    })
  }
}
