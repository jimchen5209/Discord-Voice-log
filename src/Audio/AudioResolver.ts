import { existsSync as exists, readFileSync as readFile } from 'node:fs'
import type { Member } from '@projectdysnomia/dysnomia'
import type { PluginManager } from '../Plugin/Core'
import type { AudioAsset } from './AudioAsset'
import type { AudioCache } from './AudioCache'
import type { TTSProvider, TTSProviders } from './TTSProvider'

const SYSTEM_LANG = 'en-US'
const SYSTEM_VOICE = 'en-US-Wavenet-D'

// Decides which audio file represents an announcement
export class AudioResolver {
  private pluginManager: PluginManager
  private cache: AudioCache
  private providers: TTSProviders

  constructor(pluginManager: PluginManager, cache: AudioCache, providers: TTSProviders) {
    this.pluginManager = pluginManager
    this.cache = cache
    this.providers = providers
  }

  public async synthesize(provider: TTSProvider, text: string, lang: string, voice = ''): Promise<AudioAsset | undefined> {
    const path = await this.cache.getOrCreate(provider, text, lang, voice)
    return path !== null ? { path, format: provider.format, source: 'tts', provider: provider.id } : undefined
  }

  public resolveSystem(text: string): Promise<AudioAsset | undefined> {
    return this.synthesize(this.providers.wavenet, text, SYSTEM_LANG, SYSTEM_VOICE)
  }

  // Priority: plugin overwrite, assets/<id>.json TTS, assets/<id>_<type>.wav
  public async resolveMember(member: Member, type: string): Promise<AudioAsset | undefined> {
    for (const voice of this.pluginManager.voiceOverwrites) {
      const overwrittenFile = await voice.playVoice(member, type)
      if (overwrittenFile) return { path: overwrittenFile, format: 'pcm', source: 'plugin' }
    }

    const wav = `assets/${member.id}_${type}.wav`
    const wavAsset = (): AudioAsset | undefined => (exists(wav) ? { path: wav, format: undefined, source: 'wav' } : undefined)

    if (!exists(`assets/${member.id}.json`)) return wavAsset()

    const tts = JSON.parse(readFile(`assets/${member.id}.json`, { encoding: 'utf-8' }))
    if (tts.use_wave_tts && tts.lang && tts.voice && tts[type]) {
      return await this.synthesize(this.providers.wavenet, tts[type], tts.lang, tts.voice)
    }
    if (tts.lang && tts[type]) {
      return (await this.synthesize(this.providers.legacy, tts[type], tts.lang)) ?? wavAsset()
    }
    return wavAsset()
  }

  public resolveText(text: string, waveTTS: boolean, lang: string, voice: string): Promise<AudioAsset | undefined> {
    return waveTTS ? this.synthesize(this.providers.wavenet, text, lang, voice) : this.synthesize(this.providers.legacy, text, lang)
  }
}
