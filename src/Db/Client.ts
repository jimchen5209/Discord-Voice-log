import { existsSync as exists, mkdirSync as mkdir } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '@prisma/client'

export function createPrisma(databaseUrl: string) {
  if (databaseUrl.startsWith('file:')) {
    const dir = dirname(resolve(databaseUrl.slice(5)))
    if (!exists(dir)) mkdir(dir, { recursive: true })
  }

  const adapter = new PrismaBetterSqlite3({
    url: databaseUrl
  })

  return new PrismaClient({ adapter })
}
