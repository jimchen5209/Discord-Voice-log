// Fluxer voice over LiveKit: joins through the gateway, then publishes Opus over a LiveKit session.
// Loaded only when an instance has voice turned on (see Playback.ts), so werift is never loaded otherwise.
// Gateway and reconnect handling adapted from james58899/MusicBot (branch fluxer, Component/FluxerVoice.ts, MIT).

import { type ChildProcess, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import type { Readable } from 'node:stream'
import { setTimeout as sleep } from 'node:timers/promises'
import { type Client, type ClientEventListener, type ClientEventName, Events, GatewayOpcodes } from '@fluxerjs/core'
import { waitUntil } from 'async-wait-until'
import type { ILogObj, Logger } from 'tslog'
import { RtpHeader, RtpPacket } from 'werift'
import type { AudioAsset } from '../../Audio/AudioAsset'
import { PlaybackQueue } from '../../Audio/PlaybackQueue'
import type { GuildKey } from '../../Platform/Scope'
import type { VoiceSession } from '../../Platform/VoicePlayback'
import { LiveKitSession } from './LiveKitSession'
import { OggOpusDemuxer, opusSamples } from './OggOpus'

const JOIN_TIMEOUT_MS = 20 * 1000
// Backoff 1s to 30s, about a minute in total
const RECONNECT_ATTEMPTS = 6
// 20 ms of Opus (CELT) silence
const SILENCE_FRAME = Buffer.from([0xf8, 0xff, 0xfe])
const OPUS_PAYLOAD_TYPE = 111
// Packets buffered ahead of the clock
const MAX_QUEUED_PACKETS = 250
const RESUME_QUEUED_PACKETS = 50

// Voice State Update (opcode 4); mutation_id is echoed in Voice State Ack
interface VoiceStateData {
  // biome-ignore lint/style/useNamingConvention: Fluxer field name
  channel_id: string | null
  // biome-ignore lint/style/useNamingConvention: Fluxer field name
  connection_id?: string
  // biome-ignore lint/style/useNamingConvention: Fluxer field name
  mutation_id?: string
}

interface VoiceServerData {
  token?: string | null
  endpoint?: string | null
  // biome-ignore lint/style/useNamingConvention: Fluxer field name
  connection_id?: string | null
  // biome-ignore lint/style/useNamingConvention: Fluxer field name
  channel_id?: string | null
  // biome-ignore lint/style/useNamingConvention: Fluxer field name
  e2ee_key?: string | null
}

export interface VoiceManagerOptions {
  logger: Logger<ILogObj>
  // Whether a LiveKit endpoint from the gateway may get the voice token
  trustEndpoint(endpoint: string): boolean
  // Connection ids the bot has in the guild, as the gateway last said
  ownConnections(guildId: string): string[]
}

// The gateway side of voice for one Fluxer client: one session per guild
export class FluxerVoiceManager {
  private client: Client
  private options: VoiceManagerOptions
  private sessions = new Map<string, FluxerVoice>()
  private unsubscribe: (() => void)[] = []

  constructor(client: Client, options: VoiceManagerOptions) {
    this.client = client
    this.options = options
    this.listen(Events.VoiceStateAck, (ack) => {
      for (const session of this.sessions.values()) {
        if (ack.mutation_id && session.mutationId === ack.mutation_id) session.onAck(ack.connection_id ?? undefined, ack.status, ack.error_code, ack.error_message)
      }
    })
    this.listen(Events.VoiceServerUpdate, (data) => {
      const session = data.guild_id ? this.sessions.get(data.guild_id) : undefined
      // Another connection of the bot, e.g. one left over from before a restart
      if (!session || (session.connectionId && data.connection_id && data.connection_id !== session.connectionId)) return
      session.onServer(data)
    })
    this.listen(Events.VoiceStateUpdate, (state) => {
      if (!state.guild_id || state.user_id !== client.user?.id) return
      const session = this.sessions.get(state.guild_id)
      // Disconnected by a moderator, or the channel was deleted
      if (session?.connectionId && state.connection_id === session.connectionId && state.channel_id === null) session.onRemoved()
    })
  }

  public createSession(guild: GuildKey, channelId: string) {
    this.sessions.get(guild.guildId)?.destroy()
    // The bot is in voice once per guild: its other connections (e.g. from before a restart) are dropped
    for (const connectionId of this.options.ownConnections(guild.guildId)) this.sendLeave(guild.guildId, connectionId)
    const session = new FluxerVoice(this, guild, channelId, this.options)
    this.sessions.set(guild.guildId, session)
    session.join()
    return session
  }

  public release(session: FluxerVoice) {
    if (this.sessions.get(session.guild.guildId) === session) this.sessions.delete(session.guild.guildId)
  }

  public sendJoin(guildId: string, channelId: string, mutationId: string) {
    // biome-ignore lint/style/useNamingConvention: Fluxer field names
    this.sendVoiceState(guildId, { channel_id: channelId, mutation_id: mutationId })
  }

  public sendLeave(guildId: string, connectionId: string) {
    // biome-ignore lint/style/useNamingConvention: Fluxer field names
    this.sendVoiceState(guildId, { channel_id: null, connection_id: connectionId })
  }

  // On the shard that has the guild
  private sendVoiceState(guildId: string, data: VoiceStateData) {
    const shardCount = Math.max(this.client.ws.getShardCount(), 1)
    const shardId = Number((BigInt(guildId) >> 22n) % BigInt(shardCount))
    this.client.sendToGateway(shardId, {
      op: GatewayOpcodes.VoiceStateUpdate,
      // biome-ignore lint/style/useNamingConvention: Fluxer field names
      d: { guild_id: guildId, self_mute: false, self_deaf: false, ...data }
    })
  }

  // Ends every session; the client is not used afterwards
  public dispose() {
    for (const session of [...this.sessions.values()]) session.destroy()
    for (const unsubscribe of this.unsubscribe) unsubscribe()
    this.unsubscribe = []
  }

  private listen<E extends ClientEventName>(event: E, handler: ClientEventListener<E>) {
    this.client.on(event, handler)
    this.unsubscribe.push(() => this.client.off(event, handler))
  }
}

interface Playing {
  input: Readable
  ffmpeg: ChildProcess | undefined
  timer: NodeJS.Timeout
  done: () => void
}

// The bot in one voice channel of a guild. Playback pauses while the LiveKit session reconnects and goes on after.
export class FluxerVoice implements VoiceSession {
  public readonly playback: PlaybackQueue
  public readonly guild: GuildKey
  // Set while a join waits for its Voice State Ack
  public mutationId: string | undefined
  public connectionId: string | undefined
  private manager: FluxerVoiceManager
  private options: VoiceManagerOptions
  private logger: Logger<ILogObj>
  private _channelId: string
  private _init = true
  private closed = false
  private joinTimer: NodeJS.Timeout | undefined
  private endpoint = ''
  private token = ''
  private session: LiveKitSession | undefined
  private reconnecting = false
  // A switch or a close makes the work of the earlier join stale
  private generation = 0
  private current: Playing | undefined
  // RTP state goes on across announcements; a gap moves the timestamp on by wall time
  private seq = 0
  private ts = 0
  // Wall time where the media sent so far ends
  private endAt: number | undefined

  constructor(manager: FluxerVoiceManager, guild: GuildKey, channelId: string, options: VoiceManagerOptions) {
    this.manager = manager
    this.guild = guild
    this.options = options
    this._channelId = channelId
    this.logger = options.logger.getSubLogger({ name: 'Voice', prefix: [`[${channelId}]`] })
    this.playback = new PlaybackQueue((asset, signal) => this.play(asset, signal))
  }

  public get channelId() {
    return this._channelId
  }

  public get init() {
    return this._init
  }

  // Also while reconnecting: playback waits for the session to come back
  public isReady() {
    return !this.closed && (this.session !== undefined || this.reconnecting)
  }

  public join() {
    this.logger.info('Connecting...')
    this.mutationId = randomUUID()
    this.connectionId = undefined
    this.manager.sendJoin(this.guild.guildId, this._channelId, this.mutationId)
    clearTimeout(this.joinTimer)
    this.joinTimer = setTimeout(() => this.close('the voice server did not answer the join'), JOIN_TIMEOUT_MS)
  }

  public switchChannel(channelId: string) {
    this.playback.clear()
    this.leaveConnection()
    this._channelId = channelId
    this.logger.settings.prefix = [`[${channelId}]`]
    this.join()
  }

  public destroy() {
    this.playback.clear()
    this.close('left')
  }

  public onAck(connectionId: string | undefined, status: string | undefined, errorCode: string | undefined, errorMessage: string | undefined) {
    if (connectionId) this.connectionId = connectionId
    if (status === 'rejected' || errorCode) this.close(`the join was refused: ${errorCode ?? ''} ${errorMessage ?? ''}`.trim())
  }

  public onServer(data: VoiceServerData) {
    if (this.closed) return
    if (data.connection_id) this.connectionId = data.connection_id
    const joining = this.mutationId !== undefined
    // A grant without endpoint and token is peer-to-peer, which bots never get, or no voice server
    if (!data.endpoint || !data.token) {
      this.close('the grant has no voice server')
      return
    }
    if (!this.options.trustEndpoint(data.endpoint)) {
      this.close(`voice server ${JSON.stringify(data.endpoint)} is not under the instance's voice origins`)
      return
    }
    // Not supported yet: in a channel with encrypted media, the bot may not be heard
    if (data.e2ee_key) this.logger.warn('The channel encrypts call media, which this version does not support; it may not be heard')
    const channelId = data.channel_id ?? this._channelId
    const moved = data.endpoint !== this.endpoint || channelId !== this._channelId
    this.endpoint = data.endpoint
    this.token = data.token
    if (channelId !== this._channelId) {
      this.logger.warn(`Moved to ${channelId}`)
      this._channelId = channelId
      this.logger.settings.prefix = [`[${channelId}]`]
    }
    if (joining) {
      clearTimeout(this.joinTimer)
      this.mutationId = undefined
      const generation = this.generation
      this.openSession().then(
        (session) => {
          if (generation !== this.generation || this.closed) {
            session.close(true)
            return
          }
          this.session = session
          this._init = false
          this.logger.info('Connected')
        },
        (error) => {
          if (generation === this.generation) this.close(`connecting failed: ${error instanceof Error ? error.message : error}`)
        }
      )
      return
    }
    // A new grant for the connection: a move or a new voice server. A token refresh alone keeps the session.
    if (moved && this.session) this.onSessionLost(this.session, false, true)
  }

  public onRemoved() {
    this.close('removed from the voice channel', false)
  }

  private async openSession() {
    const session = new LiveKitSession(this.endpoint, this.token, this.logger)
    session.on('token', (token: string) => {
      this.token = token
    })
    session.once('lost', (fatal: boolean, reason: string) => {
      this.logger.warn(`Voice session lost: ${reason}`)
      this.onSessionLost(session, fatal)
    })
    try {
      await session.open()
    } catch (error) {
      session.close(false)
      throw error
    }
    if (session.lost) throw new Error('the session dropped right after opening')
    return session
  }

  private onSessionLost(session: LiveKitSession, fatal: boolean, immediate = false) {
    if (session !== this.session || this.closed) return
    this.session = undefined
    // A move leaves the old room on purpose; a drop keeps it for a resume
    session.close(immediate)
    if (fatal) this.close('removed by the voice server', false)
    else this.reconnect(immediate)
  }

  private async reconnect(immediate: boolean) {
    if (this.reconnecting) return
    this.reconnecting = true
    const generation = this.generation
    for (let attempt = 0; attempt < RECONNECT_ATTEMPTS && generation === this.generation && !this.session; attempt++) {
      if (!immediate || attempt > 0) await sleep(Math.min(1000 * 2 ** attempt, 30 * 1000))
      if (generation !== this.generation) break
      try {
        const session = await this.openSession()
        if (generation !== this.generation) {
          session.close(true)
          break
        }
        this.session = session
        this.logger.info(`Reconnected (attempt ${attempt + 1})`)
      } catch (error) {
        this.logger.warn(`Reconnect attempt ${attempt + 1} failed:`, error)
      }
    }
    if (generation !== this.generation) return
    this.reconnecting = false
    if (!this.session) this.close('reconnecting failed')
  }

  // Ends the LiveKit session and the gateway connection; the session object can join again
  private leaveConnection() {
    this.generation++
    clearTimeout(this.joinTimer)
    this.mutationId = undefined
    this.reconnecting = false
    this.stopPlaying()
    this.session?.close(true)
    this.session = undefined
    if (this.connectionId) this.manager.sendLeave(this.guild.guildId, this.connectionId)
    this.connectionId = undefined
  }

  private close(reason: string, sendLeave = true) {
    if (this.closed) return
    this.logger.info(`Voice connection ended: ${reason}`)
    if (!sendLeave) this.connectionId = undefined
    this.leaveConnection()
    this.closed = true
    this._init = false
    this.manager.release(this)
  }

  // Resolves on end or abort; rejects (the queue counts it failed) when the connection ended or never got ready
  private async play(asset: AudioAsset, signal: AbortSignal): Promise<void> {
    if (this.closed) throw new Error('Voice connection ended')
    this.logger.info(`Playing ${asset.path}`)
    try {
      // Until someone can hear it: LiveKit drops packets before that
      await waitUntil(() => this.closed || signal.aborted || this.session?.heard === true, { timeout: JOIN_TIMEOUT_MS })
    } catch {
      this.logger.error('Voice is not ready, skipped')
      throw new Error('Voice not ready')
    }
    if (signal.aborted) return
    if (this.closed) throw new Error('Voice connection ended')

    this.stopPlaying()
    let ffmpeg: ChildProcess | undefined
    let input: Readable
    if (asset.format === 'ogg') {
      input = createReadStream(asset.path)
    } else {
      // 48 kHz stereo s16le, or a file ffmpeg probes (.wav), encoded to Ogg Opus
      const source = asset.format === 'pcm' ? ['-f', 's16le', '-ar', '48000', '-ac', '2', '-i', asset.path] : ['-i', asset.path]
      ffmpeg = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...source, '-c:a', 'libopus', '-b:a', '96k', '-frame_duration', '20', '-f', 'opus', 'pipe:1'], {
        stdio: ['ignore', 'pipe', 'pipe']
      })
      const process = ffmpeg
      process.stderr?.on('data', (line: Buffer) => this.logger.warn(`ffmpeg: ${line.toString().trim()}`))
      process.on('error', (error) => this.logger.error(`ffmpeg failed for ${asset.path}:`, error))
      input = process.stdout as Readable
    }

    // tsconfig targets es2022, which has no Promise.withResolvers
    let resolve: () => void = () => undefined
    const promise = new Promise<void>((done) => {
      resolve = done
    })
    const demuxer = new OggOpusDemuxer()
    const queue: Buffer[] = []
    let ended = false
    let first = true
    let sentMs = 0
    // Never before media already sent (the trailing silence) has played out
    let start = Math.max(performance.now(), this.endAt ?? 0)
    let pausedAt: number | undefined
    if (this.endAt !== undefined) this.ts = (this.ts + Math.round((start - this.endAt) * 48)) >>> 0

    const playing: Playing = {
      input,
      ffmpeg,
      done: resolve,
      timer: setInterval(() => {
        const session = this.session
        // Hold the position while reconnecting, then move the clock on by the pause
        if (!session) {
          pausedAt ??= performance.now()
          return
        }
        if (pausedAt !== undefined) {
          start += performance.now() - pausedAt
          pausedAt = undefined
          first = true
        }
        const now = performance.now() - start
        while (queue.length > 0 && sentMs <= now + 20) {
          sentMs += this.writeOpus(session, queue.shift() as Buffer, first) / 48
          first = false
        }
        this.endAt = start + sentMs
        if (queue.length < RESUME_QUEUED_PACKETS && input.isPaused()) input.resume()
        if (ended && queue.length === 0) this.finish(playing)
      }, 10)
    }
    this.current = playing

    const fail = (error: unknown) => {
      if (this.current !== playing) return
      this.logger.error(`Failed to play ${asset.path}:`, error)
      this.finish(playing)
    }
    input.on('error', fail)
    input.on('data', (chunk: Buffer) => {
      try {
        queue.push(...demuxer.push(chunk))
      } catch (error) {
        fail(error)
        return
      }
      if (queue.length > MAX_QUEUED_PACKETS) input.pause()
    })
    input.on('end', () => {
      ended = true
    })
    const stop = () => {
      if (this.current === playing) this.finish(playing)
    }
    signal.addEventListener('abort', stop, { once: true })
    await promise
    signal.removeEventListener('abort', stop)
  }

  private stopPlaying() {
    if (this.current) this.finish(this.current)
  }

  private finish(playing: Playing) {
    if (this.current !== playing) return
    this.current = undefined
    clearInterval(playing.timer)
    playing.input.destroy()
    playing.ffmpeg?.kill('SIGKILL')
    // Trailing silence, so listeners do not smear the cut-off audio over the gap
    if (this.session) {
      for (let i = 0; i < 5; i++) this.writeOpus(this.session, SILENCE_FRAME, false)
      this.endAt = (this.endAt ?? performance.now()) + 100
    }
    playing.done()
  }

  // Sends one Opus packet at the current RTP position; returns its samples
  private writeOpus(session: LiveKitSession, payload: Buffer, marker: boolean) {
    const samples = opusSamples(payload)
    session.write(new RtpPacket(new RtpHeader({ payloadType: OPUS_PAYLOAD_TYPE, sequenceNumber: this.seq, timestamp: this.ts, marker }), payload))
    this.seq = (this.seq + 1) & 0xffff
    this.ts = (this.ts + samples) >>> 0
    return samples
  }
}
