import type { Client } from '@projectdysnomia/dysnomia'
import type { CommandContext } from 'slash-create'
import type { ILogObj, Logger } from 'tslog'
import type { Audio } from '../../Audio/Audio'
import type { DbServerConfigManager } from '../../Db/ServerConfig'
import type { Config } from '../../Shared/Config'
import type { Lang } from '../../Shared/Lang'
import { genErrorMessage } from '../Embeds'
import type { VoiceLog } from '../VoiceLog'

export interface CommandDeps {
  client: Client
  voiceLog: VoiceLog
  logger: Logger<ILogObj>
  serverConfig: DbServerConfigManager
  config: Config
  lang: Lang
  audio: Audio
}

// Member, then server config, then permission. refresh_cache is admins only; the others allow manageMessages or admins.
export async function beginCommand(deps: CommandDeps, context: CommandContext, access: 'manageMessages' | 'admin') {
  if (!context.guildID || !context.member) return
  const member = await deps.client.getRESTGuildMember(context.guildID, context.member.id)
  if (!member) return

  const data = await deps.serverConfig.getOrCreate(member.guild.id)
  const isAdmin = deps.config.discord.admins.includes(member.id)
  const allowed = access === 'admin' ? isAdmin : member.permissions.has('manageMessages') || isAdmin
  if (!allowed) {
    await context.send({
      embeds: [genErrorMessage(deps.lang.get(data.lang).display.command.no_permission)],
      ephemeral: true
    })
    return
  }
  return { member, data }
}
