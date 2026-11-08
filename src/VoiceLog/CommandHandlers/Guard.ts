import type { ILogObj, Logger } from 'tslog'
import type { Audio } from '../../Audio/Audio'
import type { DbServerConfigManager } from '../../Db/ServerConfig'
import type { CommandRequest } from '../../Platform/Command'
import type { Lang } from '../../Shared/Lang'
import { genErrorMessage } from '../Embeds'
import type { VoiceLog } from '../VoiceLog'

export interface CommandDeps {
  voiceLog: VoiceLog
  logger: Logger<ILogObj>
  serverConfig: DbServerConfigManager
  lang: Lang
  audio: Audio
}

// Server config, then permission. refresh_cache is bot admins only; the others allow manageMessages or bot admins.
// The platform has already fetched the member and worked out request.access.
export async function beginCommand(deps: CommandDeps, request: CommandRequest, access: 'manageMessages' | 'admin') {
  const data = await deps.serverConfig.getOrCreate(request.guild)
  const { manageMessages, botAdmin } = request.access
  const allowed = access === 'admin' ? botAdmin : manageMessages || botAdmin
  if (!allowed) {
    await request.reply.send([genErrorMessage(deps.lang.get(data.lang).display.command.no_permission)], { private: true })
    return
  }
  return { data }
}
