import Queue from 'promise-queue'
import type { AudioAsset } from './AudioAsset'

export type AudioSink = (asset: AudioAsset) => Promise<void>

// Plays assets one at a time through a sink (a voice connection)
export class PlaybackQueue {
  private queue: Queue = new Queue(1, Infinity)
  private sink: AudioSink

  constructor(sink: AudioSink) {
    this.sink = sink
  }

  public enqueue(asset: AudioAsset) {
    this.queue.add(() => this.sink(asset))
  }

  public get length() {
    return this.queue.getQueueLength() + this.queue.getPendingLength()
  }
}
