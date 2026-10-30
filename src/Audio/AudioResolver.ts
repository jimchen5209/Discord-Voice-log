import { existsSync as exists, readFileSync as readFile } from 'node:fs'
import type { Member } from '@projectdysnomia/dysnomia'
import type { PluginManager } from '../Plugin/Core'
import type { AudioAsset } from './AudioAsset'
import type { LegacyTTSProvider } from './LegacyTTSProvider'
import type { WaveNetTTSProvider } from './WaveNetTTSProvider'

const SYSTEM_LANG = 'en-US'
const SYSTEM_VOICE = 'en-US-Wavenet-D'

// Decides which audio file represents an announcement
export class AudioResolver {
  private pluginManager: PluginManager
  private legacyTTS: LegacyTTSProvider
  private waveTTS: WaveNetTTSProvider

  constructor(pluginManager: PluginManager, legacyTTS: LegacyTTSProvider, waveTTS: WaveNetTTSProvider) {
    this.pluginManager = pluginManager
    this.legacyTTS = legacyTTS
    this.waveTTS = waveTTS
  }

  public async resolveSystem(text: string): Promise<AudioAsset | undefined> {
    const path = await this.waveTTS.synthesize(text, SYSTEM_LANG, SYSTEM_VOICE)
    return path !== null ? { path, format: 'ogg', source: 'waveTTS' } : undefined
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
      const path = await this.waveTTS.synthesize(tts[type], tts.lang, tts.voice)
      return path !== null ? { path, format: 'ogg', source: 'waveTTS' } : undefined
    }
    if (tts.lang && tts[type]) {
      const path = await this.legacyTTS.synthesize(tts[type], tts.lang)
      return path !== null ? { path, format: 'pcm', source: 'legacyTTS' } : wavAsset()
    }
    return wavAsset()
  }

  public async resolveText(text: string, waveTTS: boolean, lang: string, voice: string): Promise<AudioAsset | undefined> {
    if (waveTTS) {
      const path = await this.waveTTS.synthesize(text, lang, voice)
      return path !== null ? { path, format: 'ogg', source: 'waveTTS' } : undefined
    }
    const path = await this.legacyTTS.synthesize(text, lang)
    return path !== null ? { path, format: 'pcm', source: 'legacyTTS' } : undefined
  }
}
