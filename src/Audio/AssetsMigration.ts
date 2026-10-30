import { constants, existsSync as exists, mkdirSync as mkDir, readdirSync as readDir, readFileSync as readFile } from 'node:fs'
import { copyFile, rename, rm, writeFile } from 'node:fs/promises'
import { extname } from 'node:path'
import type { ILogObj, Logger } from 'tslog'
import { BACKUP_DIR, backupTimestamp } from '../Utils/Backup'
import type { MemberConfig } from './Audio'

const ASSETS_DIR = 'assets'
// Old format: use_wave_tts true with a voice -> Google Cloud, anything else -> Google Translate
const LEGACY_KEY = 'use_wave_tts'

// Rewrites old-format assets/<id>.json files to name a provider id. Files that need converting are
// first copied to backup/assets-<YYYYMMDD-HHmmss>/; if that fails nothing is rewritten.
// .wav files are never touched. Never throws.
export async function migrateAssets(mainLogger: Logger<ILogObj>) {
  const logger = mainLogger.getSubLogger({ name: 'AssetsMigration' })
  try {
    if (!exists(ASSETS_DIR)) return
    const pending: { file: string; config: MemberConfig }[] = []
    for (const file of readDir(ASSETS_DIR)) {
      if (extname(file) !== '.json') continue
      let config: unknown
      try {
        config = JSON.parse(readFile(`${ASSETS_DIR}/${file}`, { encoding: 'utf-8' }))
      } catch (error) {
        logger.error(`Skipping ${ASSETS_DIR}/${file}: invalid JSON`, error)
        continue
      }
      if (typeof config !== 'object' || config === null || Array.isArray(config)) {
        logger.error(`Skipping ${ASSETS_DIR}/${file}: unsupported format (expected a JSON object)`)
        continue
      }
      const migrated = migrateConfig(config as MemberConfig)
      if (migrated) pending.push({ file, config: migrated })
    }
    if (pending.length === 0) return

    const backupDir = `${BACKUP_DIR}/assets-${backupTimestamp()}`
    try {
      mkDir(BACKUP_DIR, { recursive: true })
      // Not recursive: fails if the directory exists, so an existing backup is never overwritten
      mkDir(backupDir)
      for (const { file } of pending) await copyFile(`${ASSETS_DIR}/${file}`, `${backupDir}/${file}`, constants.COPYFILE_EXCL)
    } catch (error) {
      logger.error('Assets backup failed; assets migration skipped and the files are left unchanged:', error)
      return
    }

    let migratedCount = 0
    for (const { file, config } of pending) {
      try {
        await writeAtomic(`${ASSETS_DIR}/${file}`, `${JSON.stringify(config, null, 2)}\n`)
        migratedCount++
        logger.info(`Migrated ${ASSETS_DIR}/${file} to provider ${config.provider}`)
      } catch (error) {
        logger.error(`Failed to migrate ${ASSETS_DIR}/${file}:`, error)
      }
    }
    logger.info(`Migrated ${migratedCount}/${pending.length} asset files, originals backed up to ${backupDir}`)
  } catch (error) {
    logger.error('Assets migration failed:', error)
  }
}

// Returns the converted config, or undefined when the file is already in the new format
function migrateConfig(config: MemberConfig): MemberConfig | undefined {
  const hasProvider = typeof config.provider === 'string'
  if (hasProvider && !(LEGACY_KEY in config)) return undefined
  // use_wave_tts without a voice fell back to Google Translate at runtime; match that, not the flag alone
  const usedWaveTTS = Boolean(config[LEGACY_KEY]) && Boolean(config.voice)
  const migrated: MemberConfig = {
    provider: hasProvider ? config.provider : usedWaveTTS ? 'google-cloud' : 'google-translate'
  }
  for (const [key, value] of Object.entries(config)) {
    if (key !== LEGACY_KEY && key !== 'provider') migrated[key] = value
  }
  return migrated
}

async function writeAtomic(path: string, data: string) {
  const temp = `${path}.${process.pid}.tmp`
  try {
    await writeFile(temp, data)
    await rename(temp, path)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}
