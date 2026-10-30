import type { AudioFormat } from './AudioAsset'

export interface TTSProvider {
  readonly format: AudioFormat
  // Resolves to a playable cached file path, or null when synthesis failed
  synthesize(text: string, lang: string, voice?: string): Promise<string | null>
}
