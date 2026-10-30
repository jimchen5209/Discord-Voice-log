import type { Member } from '@projectdysnomia/dysnomia'
import type { ILogObj, Logger } from 'tslog'
import type { PluginManager } from '../Plugin/Core'
import type { Config } from '../Utils/Config'
import type { AudioAsset } from './AudioAsset'
import { AudioCache } from './AudioCache'
import { AudioResolver } from './AudioResolver'
import { LegacyTTSProvider } from './LegacyTTSProvider'
import type { PlaybackQueue } from './PlaybackQueue'
import { WaveNetTTSProvider } from './WaveNetTTSProvider'

// Entry point of the audio module: resolve an announcement, then queue it
export class Audio {
  public readonly cache: AudioCache
  public readonly legacyTTS: LegacyTTSProvider
  public readonly waveTTS: WaveNetTTSProvider
  public readonly resolver: AudioResolver

  constructor(config: Config, mainLogger: Logger<ILogObj>, pluginManager: PluginManager) {
    const logger = mainLogger.getSubLogger({ name: 'Audio' })
    this.cache = new AudioCache()
    this.legacyTTS = new LegacyTTSProvider(this.cache, logger)
    this.waveTTS = new WaveNetTTSProvider(this.cache, config, logger)
    this.resolver = new AudioResolver(pluginManager, this.legacyTTS, this.waveTTS)
  }

  public announceReady(queue: PlaybackQueue) {
    return this.enqueue(queue, this.resolver.resolveSystem('VoiceLog is ready.'))
  }

  public announceMoved(queue: PlaybackQueue) {
    return this.enqueue(queue, this.resolver.resolveSystem('VoiceLog is moved to your channel.'))
  }

  public announceMember(queue: PlaybackQueue, member: Member, type: string) {
    return this.enqueue(queue, this.resolver.resolveMember(member, type))
  }

  public speak(queue: PlaybackQueue, text: string, waveTTS: boolean, lang: string, voice: string) {
    return this.enqueue(queue, this.resolver.resolveText(text, waveTTS, lang, voice))
  }

  private async enqueue(queue: PlaybackQueue, pending: Promise<AudioAsset | undefined>) {
    const asset = await pending
    if (asset) queue.enqueue(asset)
  }
}
