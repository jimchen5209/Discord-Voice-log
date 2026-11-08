import type { Client, TextChannel } from '@projectdysnomia/dysnomia'
import type { ILogObj, Logger } from 'tslog'
import type { Embed } from '../Platform/Embed'
import type { ChannelRef } from '../Platform/Scope'
import type { SendResult, TextOutput } from '../Platform/TextOutput'
import { toDiscordEmbed } from './Mapping'

// https://discord.com/developers/docs/topics/opcodes-and-status-codes#json-json-error-codes
const UNKNOWN_CHANNEL = 10003
const MISSING_ACCESS = 50001
const MISSING_PERMISSIONS = 50013

export class DiscordTextOutput implements TextOutput {
  private client: Client
  private logger: Logger<ILogObj>

  constructor(client: Client, logger: Logger<ILogObj>) {
    this.client = client
    this.logger = logger.getSubLogger({ name: 'Text' })
  }

  public async send(channel: ChannelRef, embeds: Embed[]): Promise<SendResult> {
    try {
      await this.client.createMessage(channel.channelId, { embeds: embeds.map(toDiscordEmbed) })
      return { ok: true }
    } catch (error) {
      this.logger.error(`Failed to send a message to ${channel.channelId}:`, error)
      const code = (error as { code?: unknown }).code
      if (code === MISSING_ACCESS || code === MISSING_PERMISSIONS) return { ok: false, reason: 'forbidden' }
      if (code === UNKNOWN_CHANNEL) return { ok: false, reason: 'not_found' }
      return { ok: false, reason: 'error' }
    }
  }

  public canSendEmbeds(channel: ChannelRef): boolean {
    const textChannel = this.client.getChannel(channel.channelId) as TextChannel | undefined
    if (!textChannel?.permissionsOf) return false
    const permissions = textChannel.permissionsOf(this.client.user.id)
    return permissions.has('sendMessages') && permissions.has('embedLinks')
  }
}
