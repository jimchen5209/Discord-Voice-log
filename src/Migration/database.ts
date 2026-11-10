import { spawnSync } from 'node:child_process'
import { existsSync as exists, readdirSync as readDir, readFileSync as readFile } from 'node:fs'
import { resolve } from 'node:path'
import { instances } from '../App/App'
import { EXIT_NO_RESTART } from '../Shared/ExitCode'
import { databasePath } from './record'
import { databaseLocked, migrationNames } from './sqlite'

const logger = instances.mainLogger.getSubLogger({ name: 'DataMigration' })

const MIGRATIONS_DIR = 'prisma/migrations'

// Waits a few seconds for another connection to release the database; if it does not, logs that it is
// in use (with outcome) and returns false. True when there is no database yet.
export async function databaseUnlocked(outcome: string) {
  const path = databasePath()
  if (!exists(path)) return true
  const locked = await databaseLocked(path, (attempt, tries, waitMs) => {
    logger.warn(`The database ${path} is locked; trying again in ${waitMs / 1000} s (${attempt}/${tries})`)
  })
  if (!locked) return true
  logger.error(
    `The database ${path} is in use by another connection (the bot, another \`pnpm migrate\`, an sqlite3 shell or a database browser); ${outcome}. Close it and run it again`
  )
  return false
}

// The Prisma CLI of this install, run with this node so it needs no shell or PATH entry. On a failure,
// logs what state it left the database in.
export function deployDatabaseMigrations() {
  const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], { stdio: 'inherit' })
  if (result.status === 0) return true
  logger.error(
    `prisma migrate deploy failed (${result.error ?? `exit ${result.status ?? result.signal}`}); ${databaseStateAfterFailure()}; assets/*.json and data-version.json were not changed`
  )
  return false
}

// What a failed `prisma migrate deploy` left: the migration Prisma recorded as failed, and whether its
// SQL runs in a transaction (BEGIN ... COMMIT), so that its changes were rolled back
function databaseStateAfterFailure() {
  let failedNames: string[]
  try {
    failedNames = migrationNames(databasePath(), 'failed')
  } catch (error) {
    return `the state of the database is unknown (${error instanceof Error ? error.message : error})`
  }
  if (failedNames.length === 0) return 'no migration was recorded as failed, so Prisma stopped before changing the database'
  const states = failedNames.map((name) => {
    const file = `${MIGRATIONS_DIR}/${name}/migration.sql`
    const sql = exists(file) ? readFile(file, { encoding: 'utf-8' }) : ''
    const transactional = /^BEGIN( TRANSACTION)?;/m.test(sql) && /^COMMIT;/m.test(sql)
    return transactional
      ? `migration ${name} failed and its changes were rolled back (it runs in a transaction)`
      : `migration ${name} failed and does not run in a transaction, so the database may be partly changed`
  })
  const resolveHint = failedNames.map((name) => `\`pnpm prisma migrate resolve --rolled-back ${name}\``).join(', ')
  return `${states.join('; ')}; migrations before it stay applied. Prisma refuses to deploy again until you restore the backup, or fix the problem and run ${resolveHint}`
}

// Migrations in prisma/migrations that the database has not finished applying. Never creates the
// database file. Exits with EXIT_NO_RESTART when prisma/migrations is missing.
export async function pendingMigrations() {
  if (!exists(MIGRATIONS_DIR)) {
    logger.error(
      `${resolve(MIGRATIONS_DIR)} not found, so the database migrations cannot be checked; nothing was changed. Run it from the project directory, or restore ${MIGRATIONS_DIR} (\`git checkout -- ${MIGRATIONS_DIR}\`)`
    )
    process.exit(EXIT_NO_RESTART)
  }
  const all = readDir(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  if (!exists(databasePath())) return all
  // better-sqlite3 (see sqlite.ts): _prisma_migrations is not a Prisma model, and the Prisma client
  // creates the database directory, which --preflight must not do
  const appliedNames = new Set(migrationNames(databasePath(), 'applied'))
  return all.filter((name) => !appliedNames.has(name))
}
