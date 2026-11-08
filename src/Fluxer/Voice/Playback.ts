import type { Client } from '@fluxerjs/core'
import type { ILogObj, Logger } from 'tslog'
import type { ChannelRef, GuildKey } from '../../Platform/Scope'
import type { VoicePlayback, VoiceSession } from '../../Platform/VoicePlayback'
import type { VoicePresenceTracker } from '../Presence'
import type * as Connection from './Connection'
import type { FluxerVoiceManager, VoiceManagerOptions } from './Connection'

// Voice playback of one Fluxer instance. The LiveKit transport (werift) is loaded on the first join, not on import.
export class FluxerVoicePlayback implements VoicePlayback {
  private client: Client
  private tracker: VoicePresenceTracker
  private options: Omit<VoiceManagerOptions, 'ownConnections'>
  private manager: FluxerVoiceManager | undefined

  constructor(client: Client, tracker: VoicePresenceTracker, logger: Logger<ILogObj>, trustEndpoint: (endpoint: string) => boolean) {
    this.client = client
    this.tracker = tracker
    this.options = { logger, trustEndpoint }
  }

  public connect(guild: GuildKey, channelId: string): VoiceSession {
    if (!this.manager) {
      const { FluxerVoiceManager } = require('./Connection') as typeof Connection
      this.manager = new FluxerVoiceManager(this.client, {
        ...this.options,
        ownConnections: (guildId) => (this.client.user ? this.tracker.connectionsOf(guildId, this.client.user.id) : [])
      })
    }
    return this.manager.createSession(guild, channelId)
  }

  // Connections left from before a restart are not reused: connect() drops them
  public adoptExisting(_guild: GuildKey): VoiceSession | undefined {
    return undefined
  }

  // Users in the channel that are not bots, from the voice states; a member that is not cached counts as a human
  public humanCount(channel: ChannelRef): number | undefined {
    const users = this.tracker.usersIn(channel.scope.guildId, channel.channelId)
    if (!users) return undefined
    const guild = this.client.guilds.get(channel.scope.guildId)
    return users.filter((userId) => userId !== this.client.user?.id && guild?.members.get(userId)?.user.bot !== true).length
  }

  public dispose() {
    this.manager?.dispose()
    this.manager = undefined
  }
}
