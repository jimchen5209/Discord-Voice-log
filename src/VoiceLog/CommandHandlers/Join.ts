import waitUntil from 'async-wait-until'
import type { CommandRequest } from '../../Platform/Command'
import { genErrorMessage, genNotChangedMessage, genSuccessMessage } from '../Embeds'
import { beginCommand, type CommandDeps, requireVoice } from './Guard'

export async function commandJoin(deps: CommandDeps, request: CommandRequest) {
  const begun = await beginCommand(deps, request, 'manageMessages')
  if (!begun) return
  if (!(await requireVoice(deps, request))) return
  const { data } = begun

  const guild = request.guild
  // Discord has at most one; which one to use when there are more is decided with the platform that allows it
  const channelID = request.operatorVoiceChannels()[0]
  if (channelID) {
    const voice = deps.voiceLog.voice.getCurrentVoice(guild)
    if (voice && voice.channelId === channelID) {
      await request.reply.send([genNotChangedMessage(deps.lang.get(data.lang).display.command.already_connected)], { private: true })
    } else {
      const newVoice = await deps.voiceLog.voice.join(guild, channelID, true, true)
      try {
        await waitUntil(() => newVoice?.isReady())
      } catch (error) {
        deps.logger.error('Voice timed out', error)
        await request.reply.send([genErrorMessage(deps.lang.get(data.lang).display.command.error)], { private: true })
        return
      }
      await request.reply.send([genSuccessMessage(deps.lang.get(data.lang).display.command.join_success)])
    }
  } else {
    await request.reply.send([genErrorMessage(deps.lang.get(data.lang).display.command.not_in_channel)], { private: true })
  }
}
