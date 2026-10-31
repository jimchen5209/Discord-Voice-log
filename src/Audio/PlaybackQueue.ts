import type { AudioAsset } from './AudioAsset'

// The sink must stop playing when signal aborts; the queue moves on either way
export type AudioSink = (asset: AudioAsset, signal: AbortSignal) => Promise<void>

export type PlaybackResult = 'played' | 'failed' | 'timeout' | 'cancelled'

export const DEFAULT_PLAYBACK_TIMEOUT_MS = 2 * 60 * 1000

interface PlaybackItem {
  asset: AudioAsset
  done: (result: PlaybackResult) => void
}

// Plays assets one at a time through a sink (a voice connection).
// Every item settles (played, failed, timed out or cancelled), so a hung sink never stalls the queue.
export class PlaybackQueue {
  private sink: AudioSink
  private timeoutMs: number
  private pending: PlaybackItem[] = []
  private current: { item: PlaybackItem; controller: AbortController } | undefined

  constructor(sink: AudioSink, timeoutMs = DEFAULT_PLAYBACK_TIMEOUT_MS) {
    this.sink = sink
    this.timeoutMs = timeoutMs
  }

  public enqueue(asset: AudioAsset): Promise<PlaybackResult> {
    return new Promise((done) => {
      this.pending.push({ asset, done })
      if (!this.current) this.next()
    })
  }

  // Cancels the playing item and drops everything pending
  public clear() {
    for (const item of this.pending.splice(0)) item.done('cancelled')
    this.current?.controller.abort()
  }

  private next() {
    const item = this.pending.shift()
    if (!item) return
    const controller = new AbortController()
    const current = { item, controller }
    this.current = current

    let settled = false
    const settle = (result: PlaybackResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (!controller.signal.aborted) controller.abort()
      item.done(result)
      if (this.current === current) this.current = undefined
      this.next()
    }
    const timer = setTimeout(() => settle('timeout'), this.timeoutMs)
    controller.signal.addEventListener('abort', () => settle('cancelled'), { once: true })

    let playing: Promise<void>
    try {
      playing = Promise.resolve(this.sink(item.asset, controller.signal))
    } catch {
      playing = Promise.reject()
    }
    playing.then(
      () => settle('played'),
      () => settle('failed')
    )
  }
}
