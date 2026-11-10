import waitUntil from 'async-wait-until'
import type { CommandContext } from 'slash-create'
import { genErrorMessage, genNotChangedMessage, genSuccessMessage } from '../Embeds'
import { beginCommand, type CommandDeps } from './Guard'

export async function commandJoin(deps: CommandDeps, context: CommandContext) {
  const begun = await beginCommand(deps, context, 'manageMessages')
  if (!begun) return
  const { member, data } = begun

  const guildId = member.guild.id
  const channelID = member.voiceState.channelID
  if (channelID) {
    const voice = deps.voiceLog.voice.getCurrentVoice(guildId)
    if (voice && voice.channelId === channelID) {
      await context.send({
        embeds: [genNotChangedMessage(deps.lang.get(data.lang).display.command.already_connected)],
        ephemeral: true
      })
    } else {
      const newVoice = await deps.voiceLog.voice.join(guildId, channelID, true, true)
      try {
        await waitUntil(() => newVoice?.isReady())
      } catch (error) {
        deps.logger.error('Voice timed out', error)
        await context.send({
          embeds: [genErrorMessage(deps.lang.get(data.lang).display.command.error)],
          ephemeral: true
        })
        return
      }
      await context.send({
        embeds: [genSuccessMessage(deps.lang.get(data.lang).display.command.join_success)]
      })
    }
  } else {
    await context.send({
      embeds: [genErrorMessage(deps.lang.get(data.lang).display.command.not_in_channel)],
      ephemeral: true
    })
  }
}
