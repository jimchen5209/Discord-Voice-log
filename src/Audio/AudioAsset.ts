export type AudioFormat = 'ogg' | 'pcm'

export type AudioSource = 'plugin' | 'tts' | 'wav'

export interface AudioAsset {
  path: string
  // undefined lets the voice library probe the file (used for .wav assets)
  format: AudioFormat | undefined
  source: AudioSource
  // TTSProvider id when source is 'tts'
  provider?: string
}
