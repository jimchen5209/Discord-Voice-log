import { existsSync as exists, readFileSync as readFile } from 'node:fs'
import type { Member } from '@projectdysnomia/dysnomia'
import type { PluginManager } from '../Plugin/Core'
import type { AudioAsset } from './AudioAsset'
import { AudioCache } from './AudioCache'
import type { PlaybackQueue } from './PlaybackQueue'
import type { TTSProvider, TTSProviders, TTSRole } from './TTSProvider'

const SYSTEM_LANG = 'en-US'
const SYSTEM_VOICE = 'en-US-Wavenet-D'

// Entry point of the audio module: decide which audio file represents an announcement, then queue it.
// Providers are injected; this module never imports a concrete provider.
export class Audio {
  private providers: TTSProviders
  private pluginManager: PluginManager
  private cache: AudioCache

  constructor(providers: TTSProviders, pluginManager: PluginManager, cache = new AudioCache()) {
    this.providers = providers
    this.pluginManager = pluginManager
    this.cache = cache
  }

  // Returns the cached file path for role's provider, or null on failure
  public synthesize(role: TTSRole, text: string, lang: string, voice = ''): Promise<string | null> {
    return this.cache.getOrCreate(this.providers[role], text, lang, voice)
  }

  public announceReady(queue: PlaybackQueue) {
    return this.enqueue(queue, this.tts(this.providers.wavenet, 'VoiceLog is ready.', SYSTEM_LANG, SYSTEM_VOICE))
  }

  public announceMoved(queue: PlaybackQueue) {
    return this.enqueue(queue, this.tts(this.providers.wavenet, 'VoiceLog is moved to your channel.', SYSTEM_LANG, SYSTEM_VOICE))
  }

  public announceMember(queue: PlaybackQueue, member: Member, type: string) {
    return this.enqueue(queue, this.resolveMember(member, type))
  }

  public speak(queue: PlaybackQueue, text: string, waveTTS: boolean, lang: string, voice: string) {
    return this.enqueue(queue, waveTTS ? this.tts(this.providers.wavenet, text, lang, voice) : this.tts(this.providers.legacy, text, lang))
  }

  private async tts(provider: TTSProvider, text: string, lang: string, voice = ''): Promise<AudioAsset | undefined> {
    const path = await this.cache.getOrCreate(provider, text, lang, voice)
    return path !== null ? { path, format: provider.format } : undefined
  }

  // Priority: plugin overwrite, assets/<id>.json TTS, assets/<id>_<type>.wav
  private async resolveMember(member: Member, type: string): Promise<AudioAsset | undefined> {
    for (const voice of this.pluginManager.voiceOverwrites) {
      const overwrittenFile = await voice.playVoice(member, type)
      if (overwrittenFile) return { path: overwrittenFile, format: 'pcm' }
    }

    const wav = `assets/${member.id}_${type}.wav`
    const wavAsset = (): AudioAsset | undefined => (exists(wav) ? { path: wav, format: undefined } : undefined)

    if (!exists(`assets/${member.id}.json`)) return wavAsset()

    const tts = JSON.parse(readFile(`assets/${member.id}.json`, { encoding: 'utf-8' }))
    if (tts.use_wave_tts && tts.lang && tts.voice && tts[type]) {
      return await this.tts(this.providers.wavenet, tts[type], tts.lang, tts.voice)
    }
    if (tts.lang && tts[type]) {
      return (await this.tts(this.providers.legacy, tts[type], tts.lang)) ?? wavAsset()
    }
    return wavAsset()
  }

  private async enqueue(queue: PlaybackQueue, pending: Promise<AudioAsset | undefined>) {
    const asset = await pending
    if (asset) queue.enqueue(asset)
  }
}
