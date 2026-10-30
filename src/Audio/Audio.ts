import { existsSync as exists, readFileSync as readFile } from 'node:fs'
import type { Member } from '@projectdysnomia/dysnomia'
import type { ILogObj, Logger } from 'tslog'
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
  // Provider id for the bot's own announcements
  systemProvider: string
}

export interface TTSRequest {
  provider: string
  text: string
  lang: string
  voice: string
}

// Contents of assets/<id>.json: provider / lang / voice plus one text per member event
export type MemberConfig = Record<string, unknown>

// Entry point of the audio module: decide which audio file represents an announcement, then queue it.
// Providers are injected by id; this module never imports a concrete provider.
export class Audio {
  private providers: Map<string, TTSProvider>
  private pluginManager: PluginManager
  private options: AudioOptions
  private cache: AudioCache
  private logger: Logger<ILogObj>

  constructor(providers: Map<string, TTSProvider>, pluginManager: PluginManager, logger: Logger<ILogObj>, options: AudioOptions, cache = new AudioCache({ logger })) {
    this.providers = providers
    this.pluginManager = pluginManager
    this.logger = logger.getSubLogger({ name: 'Audio' })
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

  public evictCache() {
    return this.cache.evict()
  }

  // Returns the cached file path for the request, or null on failure
  public async synthesize(request: TTSRequest): Promise<string | null> {
    const provider = this.provider(request.provider)
    return this.cache.getOrCreate(provider, request.text, request.lang, provider.usesVoice ? request.voice : '')
  }

  public systemRequests(): TTSRequest[] {
    return [this.systemRequest(MOVED_TEXT), this.systemRequest(READY_TEXT)]
  }

  // undefined (with an error log) when the file does not name a usable provider
  public readMemberConfig(path: string): MemberConfig | undefined {
    const config: MemberConfig = JSON.parse(readFile(path, { encoding: 'utf-8' }))
    if (typeof config.provider !== 'string') {
      this.logger.error(`Skipping ${path}: old format without "provider", restart the bot to migrate it`)
      return undefined
    }
    if (!this.providers.has(config.provider)) {
      this.logger.error(`Skipping ${path}: unknown TTS provider "${config.provider}" (available: ${this.providerIds().join(', ')})`)
      return undefined
    }
    return config
  }

  public memberRequest(config: MemberConfig, type: string): TTSRequest | undefined {
    const text = config[type] as string
    const lang = config.lang as string
    if (!lang || !text) return undefined
    const provider = this.provider(config.provider as string)
    return { provider: provider.id, text, lang, voice: provider.usesVoice ? ((config.voice as string | undefined) ?? '') : '' }
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

    const config = this.readMemberConfig(`assets/${member.id}.json`)
    const request = config && this.memberRequest(config, type)
    if (!request) return wavAsset()
    // Files on the system provider (Google Cloud) never fell back to the wav file
    if (request.provider === this.options.systemProvider) return await this.tts(request)
    return (await this.tts(request)) ?? wavAsset()
  }

  private async enqueue(queue: PlaybackQueue, pending: Promise<AudioAsset | undefined>) {
    const asset = await pending
    if (asset) queue.enqueue(asset)
  }
}
