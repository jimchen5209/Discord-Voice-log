import type { PlatformConfig } from './Platform'
import type { SQLiteConfig } from './SQLite'
import type { TTSConfig } from './TTS'

export type { DiscordConfig, FluxerInstanceConfig, PlatformConfig } from './Platform'
export type { SQLiteConfig } from './SQLite'
export type { GoogleTTSConfig, SystemVoiceConfig, TTSConfig, TTSProvidersConfig, XaiTTSConfig } from './TTS'

export interface ConfigValue {
  configVersion: string | number
  platform: PlatformConfig
  tts: TTSConfig
  sqlite: SQLiteConfig
  debug: boolean
}
