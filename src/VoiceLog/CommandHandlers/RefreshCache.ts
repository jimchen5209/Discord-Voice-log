import type { CommandRequest } from '../../Platform/Command'
import { beginCommand, type CommandDeps } from './Guard'

export async function commandRefreshCache(deps: CommandDeps, request: CommandRequest) {
  const begun = await beginCommand(deps, request, 'admin')
  if (!begun) return

  deps.voiceLog.cacheRefresh.refreshCache(request.reply)
}
