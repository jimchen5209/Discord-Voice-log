import type { CommandRequest } from '../../Platform/Command'
import { genNotChangedMessage, genSuccessMessage } from '../Embeds'
import { beginCommand, type CommandDeps, requireVoice } from './Guard'

export async function commandLeave(deps: CommandDeps, request: CommandRequest) {
  const begun = await beginCommand(deps, request, 'manageMessages')
  if (!begun) return
  if (!(await requireVoice(deps, request))) return
  const { data } = begun
  const guild = request.guild

  const lang = deps.lang.get(data.lang).display.command

  const joined = deps.voiceLog.voice.voices(guild).map((voice) => voice.channelId)
  if (joined.length === 0) {
    await request.reply.send([genNotChangedMessage(lang.bot_not_connected)], { private: true })
    return
  }
  // The channels of the operator the bot is in; when there are none, every channel
  const targets = request.operatorVoiceChannels().filter((channelId) => joined.includes(channelId))
  if (targets.length === 0) await deps.voiceLog.voice.destroy(guild, undefined, true)
  for (const channelId of targets) await deps.voiceLog.voice.destroy(guild, channelId, true)
  await request.reply.send([genSuccessMessage(lang.leave_success)])
}
