import { spawn } from 'node:child_process'
import { existsSync as exists, readdirSync as readDir } from 'node:fs'
import { instances } from '../../Utils/Instances'
import { prisma } from './Client'

const MIGRATIONS_DIR = 'prisma/migrations'
// Rewrites existing rows (ttsType -> ttsProvider); unmapped values are logged before it runs
const TTS_PROVIDER_MIGRATION = '20261030120000_tts_provider'

const logger = instances.mainLogger.getSubLogger({ name: 'SQLite:Schema' })

// Applies pending Prisma migrations with `prisma migrate deploy`. Nothing is backed up: the operator
// backs up the database before updating. Throws when the migration fails, so main() logs the reason
// and exits instead of starting on an unmigrated database.
export async function applyPendingMigrations() {
  const pending = await pendingMigrations()
  if (pending.length === 0) return
  logger.info(`Applying pending database migrations: ${pending.join(', ')}`)

  const convertsRows = pending.includes(TTS_PROVIDER_MIGRATION) && (await hasTable('serverConfig')) && (await countRows('serverConfig')) > 0
  if (convertsRows) await logUnmappedTTSTypes()
  await prisma.$disconnect()

  const { code, output } = await runPrisma(['migrate', 'deploy'])
  if (code !== 0) throw new Error(`prisma migrate deploy failed (exit code ${code}):\n${output}`)
  logger.info('Database migrations applied')
}

async function pendingMigrations() {
  if (!exists(MIGRATIONS_DIR)) {
    logger.warn(`${MIGRATIONS_DIR} not found, skipping database migrations`)
    return []
  }
  const all = readDir(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  if (!(await hasTable('_prisma_migrations'))) return all

  const applied = await prisma.$queryRawUnsafe<{ name: string }[]>('SELECT migration_name AS name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')
  const appliedNames = new Set(applied.map((row) => row.name))
  return all.filter((name) => !appliedNames.has(name))
}

async function hasTable(name: string) {
  const rows = await prisma.$queryRawUnsafe<unknown[]>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", name)
  return rows.length > 0
}

async function countRows(table: string) {
  const [row] = await prisma.$queryRawUnsafe<{ count: number | bigint }[]>(`SELECT COUNT(*) AS count FROM "${table}"`)
  return Number(row.count)
}

async function logUnmappedTTSTypes() {
  const rows = await prisma.$queryRawUnsafe<{ serverID: string; ttsType: string }[]>(`SELECT serverID, ttsType FROM serverConfig WHERE ttsType NOT IN ('WaveNet', 'Legacy')`)
  for (const row of rows) {
    logger.warn(`Guild ${row.serverID} has unknown TTS type "${row.ttsType}"; migrating to the default provider google-cloud`)
  }
}

function runPrisma(args: string[]) {
  return new Promise<{ code: number | null; output: string }>((res, rej) => {
    const child = spawn(process.execPath, [require.resolve('prisma/build/index.js'), ...args], {
      // biome-ignore lint/style/useNamingConvention: environment variable
      env: { ...process.env, CHECKPOINT_DISABLE: '1' }
    })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
    })
    child.on('error', rej)
    child.on('close', (code) => res({ code, output: output.trim() }))
  })
}
