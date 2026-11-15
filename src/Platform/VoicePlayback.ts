import type { PlaybackQueue } from '../Audio/PlaybackQueue'
import type { ChannelRef, GuildKey } from './Scope'

export interface VoiceSession {
  readonly channelId: string
  readonly playback: PlaybackQueue
  // True until the first connection attempt has connected
  readonly init: boolean
  isReady(): boolean
  switchChannel(channelId: string): void
  destroy(): void
}

export interface VoicePlayback {
  // True when the bot can be in several voice channels of one guild at once (one session per channel);
  // false: one session per guild, moved with switchChannel
  readonly multiChannel: boolean
  connect(guild: GuildKey, channelId: string): VoiceSession
  // A ready connection the platform already has in the guild
  adoptExisting(guild: GuildKey): VoiceSession | undefined
  // Members in the channel that are not bots; undefined when the bot cannot tell
  humanCount(channel: ChannelRef): number | undefined
}
