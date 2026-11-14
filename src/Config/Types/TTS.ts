export interface GoogleTTSConfig {
  apiKey: string
}

export interface XaiTTSConfig {
  apiKey: string
}

export interface SystemVoiceConfig {
  provider: string
  lang: string
  voice: string
}

export interface TTSProvidersConfig {
  googleTTS: GoogleTTSConfig
  xaiTTS: XaiTTSConfig
}

export interface TTSConfig {
  providers: TTSProvidersConfig
  systemVoice: SystemVoiceConfig
}
