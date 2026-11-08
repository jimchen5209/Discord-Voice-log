// Turns Fluxer voice states, which are per connection, into the join/leave/move of a person.
// A user can have several connections, in one channel or in several. Pure: no SDK, no I/O.

export interface VoiceStateUpdate {
  guildId: string
  userId: string
  connectionId: string
  // null when the connection left
  channelId: string | null
  // Only goes up for the participant, but a leave keeps the version of the connection's last state.
  // A live connection ignores older versions; an ended one also ignores its own, so it cannot come back.
  version?: number
}

// left: the user's last connection in that channel ended. entered: the user's first connection in that channel.
export interface PresenceDelta {
  guildId: string
  userId: string
  left?: string
  entered?: string
}

interface Connection {
  userId: string
  channelId: string
  version?: number
}

// How long the version of an ended connection is kept, so a late update cannot bring it back
const ENDED_TTL_MS = 10 * 60 * 1000

export class VoicePresenceTracker {
  // guildId -> connectionId -> connection
  private guilds = new Map<string, Map<string, Connection>>()
  // `${guildId}:${connectionId}` -> last version and when it ended
  private ended = new Map<string, { version: number; at: number }>()

  // A snapshot (Guild Create or Guild Sync): replaces what is known for the guild and reports nothing,
  // so the people already in voice are not announced again
  public rebaseline(guildId: string, states: VoiceStateUpdate[]) {
    const connections = new Map<string, Connection>()
    for (const state of states) {
      if (state.channelId === null) continue
      connections.set(state.connectionId, { userId: state.userId, channelId: state.channelId, version: state.version })
    }
    this.guilds.set(guildId, connections)
  }

  // The guild was lost or became unavailable: nothing is known until the next snapshot
  public forget(guildId: string) {
    this.guilds.delete(guildId)
  }

  // Channels the user has at least one connection in
  public channelsOf(guildId: string, userId: string): string[] {
    return [...this.countChannels(guildId, userId).keys()]
  }

  // Undefined when nothing changed for the person: a duplicate, a stale update, a mute, a second connection
  // to a channel they are already in, or the end of a connection that was never seen
  public apply(update: VoiceStateUpdate, now = Date.now()): PresenceDelta | undefined {
    this.pruneEnded(now)
    const { guildId, userId, connectionId, channelId, version } = update
    let connections = this.guilds.get(guildId)
    if (!connections) {
      connections = new Map()
      this.guilds.set(guildId, connections)
    }
    const endedKey = `${guildId}:${connectionId}`
    const previous = connections.get(connectionId)
    if (version !== undefined) {
      if (previous?.version !== undefined && version < previous.version) return
      const ended = previous ? undefined : this.ended.get(endedKey)
      if (ended && version <= ended.version) return
    }

    const before = this.countChannels(guildId, userId)
    if (channelId === null) {
      connections.delete(connectionId)
      if (version !== undefined) this.ended.set(endedKey, { version, at: now })
    } else {
      connections.set(connectionId, { userId, channelId, version })
      this.ended.delete(endedKey)
    }
    const after = this.countChannels(guildId, userId)

    const left = previous && previous.channelId !== channelId && !after.has(previous.channelId) ? previous.channelId : undefined
    const entered = channelId !== null && channelId !== previous?.channelId && !before.has(channelId) ? channelId : undefined
    if (!left && !entered) return
    return { guildId, userId, left, entered }
  }

  private countChannels(guildId: string, userId: string) {
    const counts = new Map<string, number>()
    for (const connection of this.guilds.get(guildId)?.values() ?? []) {
      if (connection.userId === userId) counts.set(connection.channelId, (counts.get(connection.channelId) ?? 0) + 1)
    }
    return counts
  }

  private pruneEnded(now: number) {
    for (const [key, { at }] of this.ended) {
      if (now - at > ENDED_TTL_MS) this.ended.delete(key)
    }
  }
}
