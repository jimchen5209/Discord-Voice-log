import type { Member } from '@projectdysnomia/dysnomia'
import type { GuildKey, PlatformScope } from '../Platform/Scope'
import type { MemberView } from '../Platform/Views'

export const DISCORD_SCOPE: PlatformScope = { platform: 'discord', instanceId: 'discord' }

export function discordGuild(guildId: string): GuildKey {
  return { ...DISCORD_SCOPE, guildId }
}

export function toMemberView(member: Member): MemberView {
  return {
    scope: discordGuild(member.guild.id),
    userId: member.id,
    username: member.username,
    displayName: member.nick ? member.nick : member.username,
    avatarUrl: member.avatarURL
  }
}
