import { defaultSystemVoice, defaultTTS } from '../Defaults'
import type { SystemVoiceConfig, TTSConfig } from '../Types'

export interface RawTTSConfig {
  tts?: {
    providers?: { googleTTS?: { apiKey?: string }; xaiTTS?: { apiKey?: string } }
    systemVoice?: Partial<SystemVoiceConfig>
  }
  googleTTS?: { apiKey?: string }
  xaiTTS?: { apiKey?: string }
  googleAPIKey?: string
  systemVoice?: Partial<SystemVoiceConfig>
}

// tts.providers and tts.systemVoice; googleTTS, xaiTTS, googleAPIKey and systemVoice at the top level in older files
export function mergeTTS(raw: RawTTSConfig): TTSConfig {
  const fallback = defaultTTS()
  const providers = raw.tts?.providers
  const googleFromFile = providers?.googleTTS?.apiKey ? providers.googleTTS.apiKey : raw.googleTTS?.apiKey
  const xaiFromFile = providers?.xaiTTS?.apiKey ? providers.xaiTTS.apiKey : raw.xaiTTS?.apiKey
  return {
    providers: {
      googleTTS: {
        apiKey: googleFromFile ? googleFromFile : raw.googleAPIKey ? raw.googleAPIKey : fallback.providers.googleTTS.apiKey
      },
      xaiTTS: {
        apiKey: xaiFromFile ? xaiFromFile : fallback.providers.xaiTTS.apiKey
      }
    },
    systemVoice: mergeSystemVoice(raw.tts?.systemVoice ?? raw.systemVoice)
  }
}

export function mergeSystemVoice(systemVoice: Partial<SystemVoiceConfig> | undefined): SystemVoiceConfig {
  const fallback = defaultSystemVoice()
  return {
    provider: systemVoice?.provider ? systemVoice.provider : fallback.provider,
    lang: systemVoice?.lang ? systemVoice.lang : fallback.lang,
    voice: systemVoice?.voice ? systemVoice.voice : fallback.voice
  }
}
