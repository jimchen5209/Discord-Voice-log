import { existsSync as exists, mkdirSync as mkdir } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '@prisma/client'
import { instances } from '../../Utils/Instances'

const dbUrl = instances.config.sqlite.databaseUrl

if (dbUrl.startsWith('file:')) {
  const dir = dirname(resolve(dbUrl.slice(5)))
  if (!exists(dir)) mkdir(dir, { recursive: true })
}

const adapter = new PrismaBetterSqlite3({
  url: dbUrl
})

export const prisma = new PrismaClient({ adapter })
