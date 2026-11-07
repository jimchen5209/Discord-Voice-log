import type { CommandContext } from 'slash-create'
import { beginCommand, type CommandDeps } from './Guard'

export async function commandRefreshCache(deps: CommandDeps, context: CommandContext) {
  const begun = await beginCommand(deps, context, 'admin')
  if (!begun) return

  deps.voiceLog.cacheRefresh.refreshCache(context)
}
