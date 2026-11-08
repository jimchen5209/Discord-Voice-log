import type { Client, Member, Message, PossiblyUncachedTextableChannel, VoiceChannel } from '@projectdysnomia/dysnomia'
import type { Embed } from '../Platform/Embed'
import type { GuildKey, PlatformScope } from '../Platform/Scope'
import type { ChannelView, MemberView, MessageView } from '../Platform/Views'

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

// Names are looked up in the guild cache; a forwarded message is mapped the same way
export function toMessageView(client: Client, message: Message<PossiblyUncachedTextableChannel>): MessageView {
  const guildId = message.guildID ?? ''
  const guild = message.guildID ? client.guilds.get(message.guildID) : undefined
  return {
    scope: discordGuild(guildId),
    channelId: message.channel.id,
    authorId: message.author.id,
    // A forwarded message has no author
    authorName: message.member?.nick || message.author.globalName || message.author.username || '',
    fromSelf: message.member?.id === client.user.id,
    timestamp: message.timestamp,
    content: message.content,
    hasPoll: message.poll !== undefined,
    attachmentCount: message.attachments.size,
    stickerNames: message.stickerItems?.map((sticker) => sticker.name) ?? [],
    forwarded: message.messageSnapshots?.map((snapshot) => toMessageView(client, snapshot.message as unknown as Message<PossiblyUncachedTextableChannel>)) ?? [],
    channelMentions: message.channelMentions.map((id) => ({ id, name: guild?.channels.get(id)?.name })),
    roleMentions: message.roleMentions.map((id) => ({ id, name: guild?.roles.get(id)?.name })),
    userMentions: message.mentions.map((user) => ({ id: user.id, name: guild?.members.get(user.id)?.nick || user.globalName || user.username })),
    streamRequest: message.activity?.type === 6 ? { name: message.activity.name_override } : undefined
  }
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
