import { existsSync as exists } from 'node:fs'
import { resolve } from 'node:path'
import type { ILogObj, Logger } from 'tslog'
import { getApp } from '../App/App'
import { writeAtomic } from '../Shared/WriteAtomic'
import { logInvalidAssets, planAssets, preflightData } from './assets/plan'
import { ASSETS_DIR, assetConfigFiles } from './assets/steps'
import { BACKUP_DIR, backup, RestoreError, restore } from './backup'
import { databaseUnlocked, deployDatabaseMigrations, pendingMigrations } from './database'
import { importMongoDump, MONGO_TTS_PROVIDERS, preflightMongoDump } from './import-mongo'
import { DATA_VERSION, databasePath, readRecord, readUsableRecord, recordFilePath, type UsableRecord, writeRecord } from './record'
import { unmappedTTSTypes } from './sqlite'

export { DATA_VERSION } from './record'

// MongoDB export that `pnpm migrate` imports into SQLite whenever it exists (`--mongo-dump <path>` for
// another path), deleting it afterwards; the bot refuses to start while it exists
export const DEFAULT_MONGODB_DUMP = './mongo_dump.json'

// Rewrites existing rows (ttsType -> ttsProvider); unmapped values are logged before it runs
const TTS_PROVIDER_MIGRATION = '20261030120000_tts_provider'
// The ttsType values it maps, and the provider it writes for any other value (its CASE ... ELSE)
const MAPPED_TTS_TYPES = [...MONGO_TTS_PROVIDERS.keys()]
const UNMAPPED_TTS_PROVIDER = 'google-cloud'

let _logger: Logger<ILogObj> | undefined
const logger = () => (_logger ??= getApp().mainLogger.getSubLogger({ name: 'DataMigration' }))

// What a `pnpm migrate` run has done so far, for the message on a failure
type RunState = { yolo: boolean; backupDir?: string }

// `pnpm migrate`: checks the data version record and the assets (preflight), waits until no other
// connection holds the database locked, and stops there, changing nothing and making no backup, when
// there is nothing to migrate (see outdatedReasons). Otherwise backs up what it will change (unless yolo)
// to a new directory in backupDir, applies the database migrations (`prisma migrate deploy`), imports the MongoDB dump at
// mongoDump (or DEFAULT_MONGODB_DUMP if it exists when not given), then upgrades the app-side data. With preflight it stops after the check, having only
// read. Returns false on failure, after saying what was changed and how to restore the backup.
export async function migrate({
  preflight = false,
  skipInvalid = false,
  yolo = false,
  backupDir,
  mongoDump
}: {
  preflight?: boolean
  skipInvalid?: boolean
  yolo?: boolean
  backupDir?: string
  mongoDump?: string
}) {
  // A path given with --mongo-dump must exist; the default one is imported only when it does
  if (mongoDump !== undefined && !exists(mongoDump)) {
    logger().error(`MongoDB dump ${mongoDump} (--mongo-dump) not found; nothing was changed`)
    return false
  }
  const dumpPath = mongoDump ?? (exists(DEFAULT_MONGODB_DUMP) ? DEFAULT_MONGODB_DUMP : undefined)
  const record = readUsableRecord(recordFilePath(), 'nothing was changed')
  if (!record || !preflightData(record, { skipInvalid })) return false
  if (dumpPath !== undefined && !preflightMongoDump(dumpPath)) return false
  if (preflight) return true
  if (!(await databaseUnlocked('nothing was changed'))) return false
  const pending = await pendingMigrations()
  const reasons = outdatedReasons(pending, record, 'no data version recorded', dumpPath === undefined ? undefined : `MongoDB dump ${dumpPath}`)
  if (reasons.length === 0) {
    const unused = [...(yolo ? ['--yolo'] : []), ...(backupDir !== undefined ? ['--backup-dir'] : [])]
    if (unused.length > 0) {
      logger().error(`Nothing to migrate, so no backup is made and ${unused.join(' and ')} cannot be used; nothing was changed`)
      return false
    }
    logger().info(`Nothing to migrate (database migrations applied, data version ${DATA_VERSION}, no MongoDB dump); no backup was made`)
    return true
  }
  logger().info(`To migrate: ${reasons.join('; ')}`)
  const run: RunState = { yolo }
  const dataVersion = record.kind === 'ok' ? record.version : null
  if (!(await backupData({ yolo, dumpPath, backupDir: backupDir ?? BACKUP_DIR, dataVersion, run }))) return false
  if (pending.includes(TTS_PROVIDER_MIGRATION)) logUnmappedTTSTypes()
  if (!deployDatabaseMigrations()) return failed(run)
  if (dumpPath !== undefined && !(await importMongoDump(dumpPath))) {
    logger().error('The database migrations of this run were applied; assets/*.json and data-version.json were not changed')
    return failed(run)
  }
  return (await migrateData(record, { skipInvalid })) || failed(run)
}

// MONGODB_DUMP_PATH was replaced by --mongo-dump; only warn, so a leftover setting does not stop an upgrade
export function warnRemovedDumpEnv() {
  if (process.env.MONGODB_DUMP_PATH !== undefined) {
    logger().warn('MONGODB_DUMP_PATH is no longer read; pass the dump with `pnpm migrate --mongo-dump <path>`')
  }
}

// Logs how to undo a run that failed after it started changing data; returns false
function failed({ yolo, backupDir }: RunState) {
  if (backupDir !== undefined) logger().error(`To undo this run, stop the bot and run \`pnpm migrate --restore ${backupDir}\` (the backup made before it changed anything)`)
  else if (yolo) logger().error('No backup was made (--yolo); restore your own backup to undo this run')
  else logger().error('No backup was made: this run found no existing data to change')
  return false
}

// `pnpm migrate --restore <dir>`: puts the data in the backup at dir back (see restore in backup.ts),
// after backing up the data it replaces to a new directory in backupDir. Does not migrate. Returns false,
// after saying what was changed, on failure.
export async function restoreBackup({ dir, backupDir = BACKUP_DIR }: { dir: string; backupDir?: string }) {
  if (!(await databaseUnlocked('nothing was restored'))) return false
  try {
    const { manifest, replaced } = await restore(dir, { baseDir: backupDir, dataVersion: currentDataVersion() })
    logger().info(`Restored ${dir} (made ${manifest.createdAt} by version ${manifest.appVersion}, data version ${manifest.dataVersion ?? 'none'})`)
    logger().info(`The data from before the restore is in ${replaced}; run \`pnpm migrate --restore ${replaced}\` to go back to it`)
    logger().info('Nothing was migrated: run `pnpm migrate` to upgrade the restored data (the bot refuses to start until then), or run the version of the bot that matches it')
    return true
  } catch (error) {
    if (error instanceof RestoreError) logger().error(error.message)
    else logger().error(`Restoring ${dir} failed:`, error)
    return false
  }
}

function currentDataVersion() {
  const record = readRecord(recordFilePath())
  return record.kind === 'ok' ? record.version : null
}

// Why the data is not up to date: pending, the unapplied Prisma migrations, a data version record that
// is missing (noRecord) or older than DATA_VERSION, and dump, a MongoDB dump still to import. Empty when
// it is, the only case in which `pnpm migrate` makes no backup.
function outdatedReasons(pending: string[], record: UsableRecord, noRecord: string, dump: string | undefined) {
  const reasons: string[] = []
  if (pending.length > 0) reasons.push(`unapplied database migrations: ${pending.join(', ')}`)
  if (record.kind !== 'ok') reasons.push(noRecord)
  else if (record.version < DATA_VERSION) reasons.push(`data version ${record.version} is older than ${DATA_VERSION}`)
  if (dump !== undefined) reasons.push(dump)
  return reasons
}

// Run by `pnpm migrate` after the preflight, before anything is changed, when there is something to
// migrate. Unless yolo (then it only warns),
// backs up all the data: the database, every file in assets/, the record and the MongoDB dump at dumpPath
// (deleted after the import), whatever this run changes. Makes no backup when none of
// them exists yet (a fresh install). Returns false, having changed nothing, when the backup fails.
async function backupData({ yolo, dumpPath, backupDir, dataVersion, run }: { yolo: boolean; dumpPath?: string; backupDir: string; dataVersion: number | null; run: RunState }) {
  if (yolo) {
    logger().warn('--yolo: no backup was made')
    return true
  }
  const database = databasePath()
  const files = [recordFilePath(), ...(dumpPath !== undefined ? [dumpPath] : [])]
  if (!exists(database) && !exists(ASSETS_DIR) && !files.some((file) => exists(file))) return true
  try {
    // A path that does not exist (no database or record yet) is recorded as absent, so restoring
    // deletes the one this run creates
    run.backupDir = await backup({ database, dirs: [ASSETS_DIR], files, baseDir: backupDir, reason: 'migrate', dataVersion })
    logger().info(`Backed up to ${resolve(run.backupDir)}; to undo this run, stop the bot and run \`pnpm migrate --restore ${run.backupDir}\``)
    return true
  } catch (error) {
    logger().error('Backup failed; nothing was changed. Fix the problem and run `pnpm migrate` again, or run `pnpm migrate --yolo` to migrate without a backup:', error)
    return false
  }
}

// Before the tts_provider migration converts existing rows, logs every guild whose ttsType it maps to
// the default provider because it is neither WaveNet nor Legacy
function logUnmappedTTSTypes() {
  // better-sqlite3 (see sqlite.ts): the generated client follows the new schema and has no ttsType
  for (const row of unmappedTTSTypes(databasePath(), MAPPED_TTS_TYPES)) {
    logger().warn(`Guild ${row.serverID} has unknown TTS type "${row.ttsType}"; migrating to the default provider ${UNMAPPED_TTS_PROVIDER}`)
  }
}

// Run by `pnpm migrate` after `prisma migrate deploy`. Converts assets/<id>.json up to DATA_VERSION and
// records the version only when every file was converted; otherwise the record is left as it was, so
// running it again finishes the job. An asset file that is not a JSON object fails the run before
// anything is converted, unless skipInvalid leaves such files as they are. Returns false on failure.
async function migrateData(record: UsableRecord, { skipInvalid = false } = {}): Promise<boolean> {
  const path = recordFilePath()
  if (record.kind === 'ok' && record.version === DATA_VERSION) {
    logger().info(`Data is already at version ${DATA_VERSION}`)
    return true
  }

  const files = assetConfigFiles()
  if (record.kind === 'none' && files.length === 0) {
    await writeRecord(path, DATA_VERSION)
    logger().info(`Fresh install, data version ${DATA_VERSION} recorded in ${path}`)
    return true
  }

  // No record but existing assets/<id>.json: the install predates data versions, so version 1
  const from = record.kind === 'ok' ? record.version : 1
  logger().info(`Upgrading data from version ${from} to ${DATA_VERSION}`)
  const { pending, invalid } = planAssets(files, from, skipInvalid)
  if (invalid.length > 0 && !skipInvalid) {
    logInvalidAssets(invalid, `nothing was converted and data version is still ${from}`)
    return false
  }

  let failed = 0
  for (const { file, config } of pending) {
    try {
      await writeAtomic(`${ASSETS_DIR}/${file}`, `${JSON.stringify(config, null, 2)}\n`)
      logger().info(`Migrated ${ASSETS_DIR}/${file} to provider ${config.provider}`)
    } catch (error) {
      failed++
      logger().error(`Failed to migrate ${ASSETS_DIR}/${file}:`, error)
    }
  }
  if (failed > 0) {
    logger().error(`${failed} asset files could not be migrated; data version is still ${from}, run \`pnpm migrate\` again`)
    return false
  }

  await writeRecord(path, DATA_VERSION)
  logger().info(`Data version ${DATA_VERSION} recorded in ${path}`)
  return true
}

// Run at bot startup; only reads. Returns false (after logging one error) when the bot must not start:
// unapplied Prisma migrations, a missing or older data version, a MongoDB dump not imported yet, or a
// malformed or newer record.
export async function checkData(): Promise<boolean> {
  const path = recordFilePath()
  const record = readUsableRecord(path, 'refusing to start')
  if (!record) return false

  const dump = exists(DEFAULT_MONGODB_DUMP) ? `MongoDB dump ${DEFAULT_MONGODB_DUMP} not imported yet` : undefined
  const problems = outdatedReasons(await pendingMigrations(), record, `no data version recorded in ${path}`, dump)
  if (problems.length === 0) return true

  logger().error(`Data is not up to date (${problems.join('; ')}). Run \`pnpm migrate\` first`)
  return false
}
