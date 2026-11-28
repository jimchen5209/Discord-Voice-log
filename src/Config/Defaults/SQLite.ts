import type { SQLiteConfig } from '../Types'

export function defaultSQLite(): SQLiteConfig {
  return { databaseUrl: 'file:./prisma/voice-log.db' }
}
