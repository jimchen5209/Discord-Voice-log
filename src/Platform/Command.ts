import type { Embed } from './Embed'
import type { GuildKey } from './Scope'
import type { MemberView } from './Views'

export type CommandName = 'voice.join' | 'voice.leave' | 'voice.tts' | 'log.set' | 'log.unset' | 'log.language' | 'refresh_cache'

export interface ReplyHandle {
  edit(embeds: Embed[]): Promise<void>
}

export interface CommandReply {
  send(embeds: Embed[], options?: { private?: boolean }): Promise<ReplyHandle>
}

export interface CommandRequest {
  name: CommandName
  // Options of the command, parsed by the platform
  options: Record<string, unknown> | undefined
  guild: GuildKey
  operator: MemberView
  // Channel the command was sent in
  channelId: string
  // Voice channels the operator is connected to, read when called
  operatorVoiceChannels(): string[]
  // Worked out by the platform from its own permissions and its bot admin list
  access: { manageMessages: boolean; botAdmin: boolean }
  reply: CommandReply
}
