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
  const lang = deps.lang.get(data.lang).display.command
  // Discord has at most one; Fluxer joins every channel the operator is in (a platform with one session per guild moves it)
  const operatorChannels = request.operatorVoiceChannels()
  if (operatorChannels.length === 0) {
    await request.reply.send([genErrorMessage(lang.not_in_channel)], { private: true })
    return
  }
  const joined = deps.voiceLog.voice.voices(guild).map((voice) => voice.channelId)
  const targets = operatorChannels.filter((channelId) => !joined.includes(channelId))
  if (targets.length === 0) {
    await request.reply.send([genNotChangedMessage(lang.already_connected)], { private: true })
    return
  }
  const voices = await Promise.all(targets.map((channelId) => deps.voiceLog.voice.join(guild, channelId, true, true)))
  // Success when any channel joined; the others are logged
  const results = await Promise.allSettled(voices.map((voice) => waitUntil(() => voice?.isReady())))
  for (const result of results) if (result.status === 'rejected') deps.logger.error('Voice timed out', result.reason)
  if (results.some((result) => result.status === 'fulfilled')) await request.reply.send([genSuccessMessage(lang.join_success)])
  else await request.reply.send([genErrorMessage(lang.error)], { private: true })
}
