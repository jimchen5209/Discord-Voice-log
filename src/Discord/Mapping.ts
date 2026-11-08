import type { Member, VoiceChannel } from '@projectdysnomia/dysnomia'
import type { Embed } from '../Platform/Embed'
import type { GuildKey, PlatformScope } from '../Platform/Scope'
import type { ChannelView, MemberView } from '../Platform/Views'

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

export function toChannelView(channel: VoiceChannel): ChannelView {
  return { scope: discordGuild(channel.guild.id), channelId: channel.id, name: channel.name }
}

// Accepted by both Dysnomia and slash-create
export interface DiscordEmbed {
  title?: string
  description?: string
  color?: number
  timestamp?: string
  // biome-ignore lint/style/useNamingConvention: Discord field name
  author?: { name: string; icon_url?: string }
  fields?: { name: string; value: string }[]
}

export function toDiscordEmbed(embed: Embed): DiscordEmbed {
  const { author, ...rest } = embed
  if (!author) return rest
  // biome-ignore lint/style/useNamingConvention: Discord field name
  return { ...rest, author: { name: author.name, icon_url: author.iconUrl } }
}
