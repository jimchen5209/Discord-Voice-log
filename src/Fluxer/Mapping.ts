import { type Client, GuildChannel, type GuildMember, type Message, type MessageSnapshot } from '@fluxerjs/core'
import type { Embed } from '../Platform/Embed'
import type { GuildKey, PlatformScope } from '../Platform/Scope'
import type { ChannelView, MemberView, MessageView } from '../Platform/Views'

export function fluxerGuild(scope: PlatformScope, guildId: string): GuildKey {
  return { ...scope, guildId }
}

export function toMemberView(scope: PlatformScope, member: GuildMember): MemberView {
  return {
    scope: fluxerGuild(scope, member.guild.id),
    userId: member.id,
    username: member.user.username,
    // Nickname, then global name, then username
    displayName: member.displayName,
    avatarUrl: member.displayAvatarURL()
  }
}

// Undefined when the bot cannot see the channel: a channel it cannot name is left out of the log
export function toChannelView(client: Client, guild: GuildKey, channelId: string): ChannelView | undefined {
  const channel = client.channels.get(channelId)
  if (!(channel instanceof GuildChannel) || channel.guildId !== guild.guildId || channel.name === null) return undefined
  return { scope: guild, channelId, name: channel.name }
}

function channelName(client: Client, id: string) {
  const channel = client.channels.get(id)
  return channel instanceof GuildChannel ? (channel.name ?? undefined) : undefined
}

// Channel mentions are only in the text: <#id>
function channelMentions(client: Client, content: string) {
  const ids = new Set([...content.matchAll(/<#(\d+)>/g)].map((match) => match[1]))
  return [...ids].map((id) => ({ id, name: channelName(client, id) }))
}

function memberName(client: Client, guildId: string, userId: string) {
  const member = client.guilds.get(guildId)?.members.get(userId)
  return member?.nick || member?.user.globalName || member?.user.username || undefined
}

// A forwarded message has only ids for its mentions; mentions of members not in the cache are left as they are
function snapshotView(client: Client, guild: GuildKey, channelId: string, snapshot: MessageSnapshot): MessageView {
  const content = snapshot.content ?? ''
  const roles = client.guilds.get(guild.guildId)?.roles
  return {
    scope: guild,
    channelId,
    authorId: '',
    authorName: '',
    fromSelf: false,
    timestamp: snapshot.createdAt.getTime(),
    content,
    hasPoll: false,
    attachmentCount: snapshot.attachments.length,
    stickerNames: snapshot.stickers.map((sticker) => sticker.name),
    forwarded: [],
    channelMentions: channelMentions(client, content),
    roleMentions: snapshot.mentionRoles.map((id) => ({ id, name: roles?.get(id)?.name })),
    userMentions: snapshot.mentionUserIds.flatMap((id) => {
      const name = memberName(client, guild.guildId, id)
      return name ? [{ id, name }] : []
    })
  }
}

export function toMessageView(client: Client, guild: GuildKey, message: Message): MessageView {
  const roles = client.guilds.get(guild.guildId)?.roles
  return {
    scope: guild,
    channelId: message.channelId,
    authorId: message.author.id,
    authorName: message.member?.nick || message.author.globalName || message.author.username || '',
    fromSelf: message.author.id === client.user?.id,
    timestamp: message.createdAt.getTime(),
    content: message.content,
    // Fluxer messages have no polls
    hasPoll: false,
    attachmentCount: message.attachments.size,
    stickerNames: message.stickers.map((sticker) => sticker.name),
    forwarded: message.messageSnapshots.map((snapshot) => snapshotView(client, guild, message.channelId, snapshot)),
    channelMentions: channelMentions(client, message.content),
    roleMentions: message.mentionRoles.map((id) => ({ id, name: roles?.get(id)?.name })),
    userMentions: message.mentions.map((user) => ({ id: user.id, name: memberName(client, guild.guildId, user.id) || user.globalName || user.username }))
  }
}

// The Fluxer wire format: Discord's field names, with description always present (null when there is none)
export interface FluxerEmbed {
  title?: string
  description: string | null
  color?: number
  timestamp?: string
  // biome-ignore lint/style/useNamingConvention: Fluxer field name
  author?: { name: string; icon_url?: string }
  fields?: { name: string; value: string }[]
}

export function toFluxerEmbed(embed: Embed): FluxerEmbed {
  const { author, description, ...rest } = embed
  const base = { ...rest, description: description ?? null }
  if (!author) return base
  // biome-ignore lint/style/useNamingConvention: Fluxer field name
  return { ...base, author: { name: author.name, icon_url: author.iconUrl } }
}
