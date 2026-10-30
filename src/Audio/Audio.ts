import { existsSync as exists, readFileSync as readFile } from 'node:fs'
import type { Member } from '@projectdysnomia/dysnomia'
import type { PluginManager } from '../Plugin/Core'
import type { AudioAsset } from './AudioAsset'
import { AudioCache } from './AudioCache'
import type { PlaybackQueue } from './PlaybackQueue'
import type { TTSProvider } from './TTSProvider'

const SYSTEM_LANG = 'en-US'
const SYSTEM_VOICE = 'en-US-Wavenet-D'
const READY_TEXT = 'VoiceLog is ready.'
const MOVED_TEXT = 'VoiceLog is moved to your channel.'

export const MEMBER_EVENTS = ['join', 'left', 'switched_out', 'switched_in']

export interface AudioOptions {
  // Provider id for the bot's own announcements; uid.json files with use_wave_tts also use it
  systemProvider: string
  // Provider id for uid.json files without use_wave_tts
  defaultProvider: string
}

export interface TTSRequest {
  provider: string
  text: string
  lang: string
  voice: string
}

// Contents of assets/<id>.json: lang / voice / use_wave_tts plus one text per member event
export type MemberConfig = Record<string, unknown>

// Entry point of the audio module: decide which audio file represents an announcement, then queue it.
// Providers are injected by id; this module never imports a concrete provider.
export class Audio {
  private providers: Map<string, TTSProvider>
  private pluginManager: PluginManager
  private options: AudioOptions
  private cache: AudioCache

  constructor(providers: Map<string, TTSProvider>, pluginManager: PluginManager, options: AudioOptions, cache = new AudioCache()) {
    this.providers = providers
    this.pluginManager = pluginManager
    this.options = options
    this.cache = cache
  }

  public providerIds(): string[] {
    return [...this.providers.keys()]
  }

  // Why the provider cannot be selected, or undefined when it can
  public unavailableReason(providerId: string): string | undefined {
    const provider = this.providers.get(providerId)
    if (!provider) return `Unknown TTS provider: ${providerId} (available: ${this.providerIds().join(', ')})`
    return provider.unavailableReason()
  }

  // Returns the cached file path for the request, or null on failure
  public async synthesize(request: TTSRequest): Promise<string | null> {
    const provider = this.provider(request.provider)
    return this.cache.getOrCreate(provider, request.text, request.lang, provider.usesVoice ? request.voice : '')
  }

  public systemRequests(): TTSRequest[] {
    return [this.systemRequest(MOVED_TEXT), this.systemRequest(READY_TEXT)]
  }

  public readMemberConfig(path: string): MemberConfig {
    return JSON.parse(readFile(path, { encoding: 'utf-8' }))
  }

  public memberRequest(config: MemberConfig, type: string): TTSRequest | undefined {
    const text = config[type] as string
    const lang = config.lang as string
    const voice = config.voice as string
    if (!lang || !text) return undefined
    if (config.use_wave_tts && voice) return { provider: this.options.systemProvider, text, lang, voice }
    return { provider: this.options.defaultProvider, text, lang, voice: '' }
  }

  public announceReady(queue: PlaybackQueue) {
    return this.enqueue(queue, this.tts(this.systemRequest(READY_TEXT)))
  }

  public announceMoved(queue: PlaybackQueue) {
    return this.enqueue(queue, this.tts(this.systemRequest(MOVED_TEXT)))
  }

  public announceMember(queue: PlaybackQueue, member: Member, type: string) {
    return this.enqueue(queue, this.resolveMember(member, type))
  }

  public speak(queue: PlaybackQueue, request: TTSRequest) {
    return this.enqueue(queue, this.tts(request))
  }

  private provider(id: string): TTSProvider {
    const provider = this.providers.get(id)
    if (!provider) throw new Error(`Unknown TTS provider: ${id}`)
    return provider
  }

  private systemRequest(text: string): TTSRequest {
    return { provider: this.options.systemProvider, text, lang: SYSTEM_LANG, voice: SYSTEM_VOICE }
  }

  private async tts(request: TTSRequest): Promise<AudioAsset | undefined> {
    const path = await this.synthesize(request)
    return path !== null ? { path, format: this.provider(request.provider).format } : undefined
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

    const request = this.memberRequest(this.readMemberConfig(`assets/${member.id}.json`), type)
    if (!request) return wavAsset()
    // The system provider never fell back to the wav file
    if (request.provider === this.options.systemProvider) return await this.tts(request)
    return (await this.tts(request)) ?? wavAsset()
  }

  private async enqueue(queue: PlaybackQueue, pending: Promise<AudioAsset | undefined>) {
    const asset = await pending
    if (asset) queue.enqueue(asset)
  }
}
