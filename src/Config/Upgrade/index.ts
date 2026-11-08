// Upgrades config.json at startup: reads the file as written by any earlier version and merges it into the
// current shape. Unrelated to src/Migration/, which is the data migration run by `pnpm migrate`.
import { constants, copyFileSync as copyFile, existsSync as exists } from 'node:fs'
import { defaultSQLite } from '../Defaults'
import { validatePlatform } from '../PlatformValidation'
import type { PlatformConfig, SQLiteConfig, TTSConfig } from '../Types'
import { mergeDiscordConfig, mergeFluxerConfig, type RawPlatformConfig } from './Platform'
import { mergeTTS, type RawTTSConfig } from './TTS'

export const CONFIG_VERSION = 6

// config.json as read from disk, with every key any earlier version used
export type RawConfig = RawPlatformConfig &
  RawTTSConfig & {
    configVersion?: string | number
    sqlite?: Partial<SQLiteConfig>
    debug?: boolean
    // biome-ignore lint/style/useNamingConvention: Legacy config
    Debug?: boolean
  }

export interface MigratedConfig {
  platform: PlatformConfig
  tts: TTSConfig
  sqlite: SQLiteConfig
  debug: boolean
  // Problems that make the file unusable; never includes a token
  problems: string[]
}

export function mergeSQLite(raw: RawConfig): SQLiteConfig {
  const databaseUrl = raw.sqlite?.databaseUrl
  return { databaseUrl: databaseUrl ? databaseUrl : defaultSQLite().databaseUrl }
}

// debug; Debug in older files
export function mergeDebug(raw: RawConfig): boolean {
  return raw.debug ? raw.debug : raw.Debug ? raw.Debug : false
}

export function migrateConfig(raw: RawConfig): MigratedConfig {
  const fluxer = mergeFluxerConfig(raw)
  const platform: PlatformConfig = { discord: mergeDiscordConfig(raw), fluxer: fluxer.fluxer }
  return {
    platform,
    tts: mergeTTS(raw),
    sqlite: mergeSQLite(raw),
    debug: mergeDebug(raw),
    problems: [...fluxer.problems, ...validatePlatform(platform, fluxer.positions)]
  }
}

// A missing version is a legacy file, so it is older too
export function compareVersion(version: RawConfig['configVersion']): 'older' | 'same' | 'newer' {
  if (!version || (version as number) < CONFIG_VERSION) return 'older'
  if ((version as number) > CONFIG_VERSION) return 'newer'
  return 'same'
}

// Copies ./config.json to the first free config-<version>.json, config-<version>-1.json, ...
export function backupConfigFile(oldVersion: RawConfig['configVersion']) {
  const version = oldVersion ? oldVersion : 'legacy'
  let copyConfigName = `./config-${version}.json`
  let copyNumber = 0
  while (exists(copyConfigName)) {
    copyNumber++
    copyConfigName = `./config-${version}-${copyNumber}.json`
  }
  copyFile('./config.json', copyConfigName, constants.COPYFILE_EXCL)
}
