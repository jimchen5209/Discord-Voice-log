import type { AudioFormat } from './AudioAsset'

// A replaceable speech engine. It only turns text into audio bytes;
// caching, queueing and playback are handled elsewhere.
export interface TTSProvider {
  // Stable id, part of the cache key so providers never share files
  readonly id: string
  readonly format: AudioFormat
  // false: the voice name is ignored, and left out of the cache key
  readonly usesVoice: boolean
  // Why the provider cannot be used right now (e.g. missing API key), or undefined when it can
  unavailableReason(): string | undefined
  synthesize(text: string, lang: string, voice?: string): Promise<Uint8Array | null>
}
