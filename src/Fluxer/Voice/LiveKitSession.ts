// One LiveKit signaling session (the /rtc websocket) with werift peers, publishing one stereo Opus track.
// Adapted from james58899/MusicBot (branch fluxer, Component/FluxerVoice.ts, MIT): Opus packets are sent as RTP
// as they are, without decoding or re-encoding. Playback only: nothing is subscribed to.

import { EventEmitter } from 'node:events'
import {
  AddTrackRequest,
  DisconnectReason,
  LeaveRequest,
  LeaveRequest_Action,
  MuteTrackRequest,
  Ping,
  SessionDescription,
  SignalRequest,
  SignalResponse,
  SignalTarget,
  TrackSource,
  TrackType,
  TrickleRequest
} from '@livekit/protocol'
import type { ILogObj, Logger } from 'tslog'
import { MediaStream, MediaStreamTrack, RTCPeerConnection, RTCRtpCodecParameters, type RtpPacket } from 'werift'
import WebSocket from 'ws'

const STEP_TIMEOUT_MS = 20 * 1000
// LiveKit drops packets until a listener's downtrack is bound; playback waits for that, this long at most
const LISTENER_WAIT_MS = 5 * 1000

type SignalCase = NonNullable<SignalResponse['message']['case']>
type SignalValue<K extends SignalCase> = Extract<SignalResponse['message'], { case: K }>['value']

export const ERR_SESSION_LOST = new Error('Voice session lost')

// LiveKit's websocket URL for an endpoint from Voice Server Update; the path is kept (self-hosted: e.g. /livekit)
export function signalUrl(endpoint: string, token: string) {
  const url = new URL(/^[a-z]+:\/\//i.test(endpoint) ? endpoint : `wss://${endpoint}`)
  url.protocol = url.protocol === 'http:' || url.protocol === 'ws:' ? 'ws:' : 'wss:'
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/rtc`
  url.search = new URLSearchParams({
    // biome-ignore lint/style/useNamingConvention: LiveKit query parameter
    access_token: token,
    // biome-ignore lint/style/useNamingConvention: LiveKit query parameter
    auto_subscribe: '0',
    sdk: 'js',
    version: '2.23.0',
    protocol: '16',
    // biome-ignore lint/style/useNamingConvention: LiveKit query parameter
    adaptive_stream: '0'
  }).toString()
  return url
}

/**
 * @emits lost(fatal: boolean, reason: string) - the session ended; fatal when the server removed the bot for good (once)
 * @emits token(token: string) - a refreshed access token, for reconnecting
 */
export class LiveKitSession extends EventEmitter {
  public lost = false
  // True once someone can hear the track, or after LISTENER_WAIT_MS
  public heard = false
  private ws: WebSocket | undefined
  private pub: RTCPeerConnection | undefined
  private sub: RTCPeerConnection | undefined
  private track = new MediaStreamTrack({ kind: 'audio' })
  private trackSid: string | undefined
  private identity: string | undefined
  private pingTimer: NodeJS.Timeout | undefined
  private listenerTimer: NodeJS.Timeout | undefined
  private waiters = new Map<SignalCase, { filter(value: unknown): boolean; resolve(value: unknown): void }>()
  private endpoint: string
  private token: string
  private logger: Logger<ILogObj>

  constructor(endpoint: string, token: string, logger: Logger<ILogObj>) {
    super()
    this.endpoint = endpoint
    this.token = token
    this.logger = logger
  }

  // Resolves once the track is published and the publisher peer is connected
  public async open() {
    // The ws package, not Node's WebSocket: Node's drops the server's last "leave" before the close
    const ws = new WebSocket(signalUrl(this.endpoint, this.token))
    this.ws = ws
    ws.on('message', (data: Buffer) => {
      this.onSignal(SignalResponse.fromBinary(data)).catch((error) => this.logger.error('LiveKit signal failed:', error))
    })
    ws.on('close', (code, reason) => this.markLost(false, `signal socket closed (${code} ${reason.toString()})`))
    ws.on('error', (error) => this.logger.warn(`LiveKit signal socket error: ${error.message}`))

    const join = await this.wait('join')
    this.identity = join.participant?.identity
    const iceServers = join.iceServers.map((server) => ({ urls: server.urls[0], username: server.username || undefined, credential: server.credential || undefined }))
    const codecs = {
      audio: [new RTCRtpCodecParameters({ mimeType: 'audio/opus', clockRate: 48000, channels: 2, parameters: 'minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1' })],
      video: []
    }
    this.pub = this.createPeer({ iceServers, codecs }, SignalTarget.PUBLISHER)
    this.sub = this.createPeer({ iceServers, codecs }, SignalTarget.SUBSCRIBER)
    this.pingTimer = setInterval(() => this.send({ case: 'pingReq', value: new Ping({ timestamp: BigInt(Date.now()) }) }), (join.pingInterval || 5) * 1000)

    // One track for the whole session: listeners stay subscribed between announcements
    this.pub.addTrack(this.track, new MediaStream([this.track]))
    const cid = this.track.id
    const published = this.wait('trackPublished', (value) => value.cid === cid)
    this.send({
      case: 'addTrack',
      value: new AddTrackRequest({ cid, name: 'voicelog', type: TrackType.AUDIO, source: TrackSource.MICROPHONE, stereo: true, disableDtx: true, disableRed: true })
    })
    const { track } = await published
    this.trackSid = track?.sid
    this.wait('trackSubscribed', (value) => value.trackSid === track?.sid)
      .then(() => this.markHeard())
      .catch(() => undefined)

    const pub = this.pub
    await pub.setLocalDescription(await pub.createOffer())
    this.send({ case: 'offer', value: new SessionDescription({ type: 'offer', sdp: pub.localDescription?.sdp ?? '', id: 1 }) })
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('LiveKit: publisher did not connect')), STEP_TIMEOUT_MS)
      const { unSubscribe } = pub.connectionStateChange.subscribe((state) => {
        if (state !== 'connected') return
        clearTimeout(timer)
        unSubscribe()
        resolve()
      })
      this.once('lost', () => {
        clearTimeout(timer)
        reject(ERR_SESSION_LOST)
      })
    })
    this.listenerTimer = setTimeout(() => this.markHeard(), LISTENER_WAIT_MS)
  }

  public write(packet: RtpPacket) {
    this.track.writeRtp(packet)
  }

  // sendLeave: tell the server the bot left on purpose; otherwise it keeps the participant for a resume
  public close(sendLeave: boolean) {
    this.lost = true
    clearInterval(this.pingTimer)
    clearTimeout(this.listenerTimer)
    if (sendLeave) this.send({ case: 'leave', value: new LeaveRequest({ reason: DisconnectReason.CLIENT_INITIATED }) })
    this.ws?.removeAllListeners('close')
    this.ws?.close()
    this.pub?.close().catch(() => undefined)
    this.sub?.close().catch(() => undefined)
  }

  private markHeard() {
    clearTimeout(this.listenerTimer)
    this.heard = true
  }

  private markLost(fatal: boolean, reason: string) {
    if (this.lost) return
    this.lost = true
    this.emit('lost', fatal, reason)
  }

  private createPeer(config: ConstructorParameters<typeof RTCPeerConnection>[0], target: SignalTarget) {
    const peer = new RTCPeerConnection(config)
    peer.onIceCandidate.subscribe((candidate) => {
      if (candidate) this.send({ case: 'trickle', value: new TrickleRequest({ candidateInit: JSON.stringify(candidate.toJSON()), target }) })
    })
    peer.connectionStateChange.subscribe((state) => {
      if (state === 'failed' || state === 'closed') this.markLost(false, `${SignalTarget[target]} peer ${state}`)
    })
    return peer
  }

  private send(message: SignalRequest['message']) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(new SignalRequest({ message }).toBinary())
  }

  private wait<K extends SignalCase>(kind: K, filter: (value: SignalValue<K>) => boolean = () => true): Promise<SignalValue<K>> {
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`LiveKit: timed out waiting for ${kind}`)), STEP_TIMEOUT_MS)
      this.once('lost', () => {
        clearTimeout(timer)
        reject(ERR_SESSION_LOST)
      })
      this.waiters.set(kind, {
        filter: (value) => filter(value as SignalValue<K>),
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        }
      })
    }) as Promise<SignalValue<K>>
  }

  private async onSignal({ message }: SignalResponse) {
    if (!message.case) return
    const waiter = this.waiters.get(message.case)
    if (waiter?.filter(message.value)) {
      this.waiters.delete(message.case)
      waiter.resolve(message.value)
    }

    switch (message.case) {
      // The server opens the subscriber session; nothing is subscribed, but it must be answered
      case 'offer': {
        const sub = this.sub
        if (!sub) return
        await sub.setRemoteDescription({ type: 'offer', sdp: message.value.sdp })
        await sub.setLocalDescription(await sub.createAnswer())
        this.send({ case: 'answer', value: new SessionDescription({ type: 'answer', sdp: sub.localDescription?.sdp ?? '', id: message.value.id }) })
        break
      }
      case 'answer':
        await this.pub?.setRemoteDescription({ type: 'answer', sdp: message.value.sdp })
        break
      case 'trickle': {
        const peer = message.value.target === SignalTarget.PUBLISHER ? this.pub : this.sub
        await peer?.addIceCandidate(JSON.parse(message.value.candidateInit))
        break
      }
      case 'update': {
        // A Fluxer server mute mutes the track and sets the server_mute attribute. Lifting it only removes the attribute:
        // the client unmutes its own track.
        const self = message.value.participants.find((participant) => participant.identity === this.identity)
        if (self && !self.attributes.server_mute && self.tracks.some((track) => track.sid === this.trackSid && track.muted)) {
          this.logger.info('Server mute lifted, unmuting the track')
          this.send({ case: 'mute', value: new MuteTrackRequest({ sid: this.trackSid, muted: false }) })
        }
        break
      }
      case 'refreshToken':
        this.token = message.value
        this.emit('token', message.value)
        break
      case 'leave':
        // DISCONNECT without canReconnect: removed for good (kicked, room closed); otherwise reconnect
        this.markLost(
          message.value.action === LeaveRequest_Action.DISCONNECT && !message.value.canReconnect,
          `server leave (action ${LeaveRequest_Action[message.value.action]}, reason ${DisconnectReason[message.value.reason]})`
        )
        break
    }
  }
}
