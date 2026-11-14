import { type Client, GuildChannel, PermissionFlags } from '@fluxerjs/core'
import type { ILogObj, Logger } from 'tslog'
import type { Embed } from '../Platform/Embed'
import type { ChannelRef } from '../Platform/Scope'
import type { SendResult, TextOutput } from '../Platform/TextOutput'
import { toFluxerEmbed } from './Mapping'

// FluxerAPIError and HTTPError both carry the HTTP status
export function failureReason(error: unknown): 'forbidden' | 'not_found' | 'error' {
  const status = (error as { statusCode?: unknown }).statusCode
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  return 'error'
}

export class FluxerTextOutput implements TextOutput {
  private client: () => Client | undefined
  private logger: Logger<ILogObj>

  // The client exists once the runtime has started
  constructor(client: () => Client | undefined, logger: Logger<ILogObj>) {
    this.client = client
    this.logger = logger.getSubLogger({ name: 'Text' })
  }

  public async send(channel: ChannelRef, embeds: Embed[]): Promise<SendResult> {
    const client = this.client()
    if (!client) return { ok: false, reason: 'error' }
    try {
      await client.rest.post(`/channels/${channel.channelId}/messages`, { body: { embeds: embeds.map(toFluxerEmbed) } })
      return { ok: true }
    } catch (error) {
      this.logger.error(`Failed to send a message to ${channel.channelId}:`, error)
      return { ok: false, reason: failureReason(error) }
    }
  }

  // From the cached guild, roles and channel overwrites; false when any of them is not cached
  public canSendEmbeds(channel: ChannelRef): boolean {
    const client = this.client()
    const me = client?.guilds.get(channel.scope.guildId)?.members.me
    const target = client?.channels.get(channel.channelId)
    if (!me || !(target instanceof GuildChannel) || target.guildId !== channel.scope.guildId) return false
    const permissions = me.permissionsIn(target)
    return permissions.has(PermissionFlags.ViewChannel) && permissions.has(PermissionFlags.SendMessages) && permissions.has(PermissionFlags.EmbedLinks)
  }
}
