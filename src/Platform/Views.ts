import type { ChannelRef, GuildKey } from './Scope'

export interface MemberView {
  scope: GuildKey
  userId: string
  username: string
  // Nickname, or the username when there is none
  displayName: string
  avatarUrl?: string
}

export interface ChannelView extends ChannelRef {
  name: string
}

// left only: leave, entered only: join, both: move
export interface VoicePresenceChange {
  member: MemberView
  guildName: string
  left?: ChannelView
  entered?: ChannelView
}

export interface MessageView {
  scope: GuildKey
  channelId: string
  authorId: string
  // Spoken before the message
  authorName: string
  fromSelf: boolean
  timestamp: number
  // Raw content; mention and emoji markup is replaced when the text is read out
  content: string
  hasPoll: boolean
  attachmentCount: number
  stickerNames: string[]
  forwarded: MessageView[]
  // name is undefined when the channel or role could not be found
  channelMentions: { id: string; name?: string }[]
  roleMentions: { id: string; name?: string }[]
  userMentions: { id: string; name: string }[]
  // Set when the message is a stream request
  streamRequest?: { name?: string }
}
