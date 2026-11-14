import { GoogleCloudTTS } from '../../Audio/Providers/GoogleCloudTTS'
import type { SystemVoiceConfig, TTSConfig } from '../Types'

export function defaultSystemVoice(): SystemVoiceConfig {
  return {
    provider: GoogleCloudTTS.id,
    lang: 'en-US',
    voice: 'en-US-Wavenet-D'
  }
}

export function defaultTTS(): TTSConfig {
  return {
    providers: {
      googleTTS: { apiKey: '' },
      xaiTTS: { apiKey: '' }
    },
    systemVoice: defaultSystemVoice()
  }
}
