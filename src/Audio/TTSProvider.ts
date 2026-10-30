import type { AudioFormat } from './AudioAsset'

// A replaceable speech engine. It only turns text into audio bytes;
// caching, queueing and playback are handled elsewhere.
export interface TTSProvider {
  // Stable id, part of the cache key so providers never share files
  readonly id: string
  readonly format: AudioFormat
  synthesize(text: string, lang: string, voice?: string): Promise<Uint8Array | null>
}

// Existing settings pick a provider by role: guild ttsType / uid.json use_wave_tts
// select "wavenet", everything else uses "legacy". System messages use "wavenet".
export type TTSRole = 'legacy' | 'wavenet'

export type TTSProviders = Record<TTSRole, TTSProvider>
