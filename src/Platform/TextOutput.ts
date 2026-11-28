import type { Embed } from './Embed'
import type { ChannelRef } from './Scope'

export type SendResult = { ok: true } | { ok: false; reason: 'forbidden' | 'not_found' | 'error' }

export interface TextOutput {
  // Never rejects: the platform logs a failure and returns it
  send(channel: ChannelRef, embeds: Embed[]): Promise<SendResult>
  // Whether the bot itself can send messages with embeds in the channel
  canSendEmbeds(channel: ChannelRef): boolean
}
