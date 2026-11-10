import { readFileSync as readFile } from 'node:fs'
import { instances } from '../../App/App'
import { DATA_VERSION, type UsableRecord } from '../record'
import { ASSET_STEPS, ASSETS_DIR, assetConfigFiles } from './steps'

const logger = instances.mainLogger.getSubLogger({ name: 'DataMigration' })

// Run by `pnpm migrate` before `prisma migrate deploy` (after readUsableRecord rejected a malformed
// record or one newer than DATA_VERSION), so (unless skipInvalid) an invalid asset file that migrateData
// would reject stops it before the database is touched. Only reads.
export function preflightData(record: UsableRecord, { skipInvalid = false } = {}): boolean {
  if (skipInvalid || (record.kind === 'ok' && record.version === DATA_VERSION)) return true
  const { invalid } = planAssets(assetConfigFiles(), record.kind === 'ok' ? record.version : 1, false)
  if (invalid.length === 0) return true
  logInvalidAssets(invalid, 'nothing was changed (the database was not migrated)')
  return false
}

export function logInvalidAssets(invalid: string[], outcome: string) {
  logger.error(
    `${invalid.length} asset files are not valid: ${invalid.join(', ')}; ${outcome}. Fix or remove them and run \`pnpm migrate\` again, or run \`pnpm migrate --skip-invalid\` to leave them unconverted`
  )
}

// Runs the steps from `from` to DATA_VERSION on every file and returns the ones that changed, and the
// paths of files that are not a JSON object (each logged, never converted).
export function planAssets(files: string[], from: number, skipInvalid: boolean) {
  const pending: { file: string; config: Record<string, unknown> }[] = []
  const invalid: string[] = []
  const label = skipInvalid ? 'Skipping' : 'Invalid'
  for (const file of files) {
    const path = `${ASSETS_DIR}/${file}`
    let config: unknown
    try {
      config = JSON.parse(readFile(path, { encoding: 'utf-8' }))
    } catch (error) {
      logger.error(`${label} ${path}: invalid JSON`, error)
      invalid.push(path)
      continue
    }
    if (typeof config !== 'object' || config === null || Array.isArray(config)) {
      logger.error(`${label} ${path}: unsupported format (expected a JSON object)`)
      invalid.push(path)
      continue
    }
    let current = config as Record<string, unknown>
    let changed = false
    for (let version = from; version < DATA_VERSION; version++) {
      const step = ASSET_STEPS[version]
      if (!step) throw new Error(`No assets migration step from data version ${version}`)
      const next = step(current)
      if (next) {
        current = next
        changed = true
      }
    }
    if (changed) pending.push({ file, config: current })
  }
  return { pending, invalid }
}
