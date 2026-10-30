import type { Member } from '@projectdysnomia/dysnomia'
import type { PluginManager } from '../Plugin/Core'
import type { AudioAsset } from './AudioAsset'
import { AudioCache } from './AudioCache'
import { AudioResolver } from './AudioResolver'
import type { PlaybackQueue } from './PlaybackQueue'
import type { TTSProviders, TTSRole } from './TTSProvider'

// Entry point of the audio module: resolve an announcement, then queue it.
// Providers are injected; this module never imports a concrete provider.
export class Audio {
  public readonly cache: AudioCache
  public readonly resolver: AudioResolver
  private providers: TTSProviders

  constructor(providers: TTSProviders, pluginManager: PluginManager, cache = new AudioCache()) {
    this.providers = providers
    this.cache = cache
    this.resolver = new AudioResolver(pluginManager, cache, providers)
  }

  // Returns the cached file path for role's provider, or null on failure
  public async synthesize(role: TTSRole, text: string, lang: string, voice = ''): Promise<string | null> {
    return (await this.resolver.synthesize(this.providers[role], text, lang, voice))?.path ?? null
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
