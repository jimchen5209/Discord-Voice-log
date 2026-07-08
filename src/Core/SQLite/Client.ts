import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '@prisma/client'
import { instances } from '../../Utils/Instances'

const adapter = new PrismaBetterSqlite3({
  url: instances.config.sqlite.databaseUrl
})

export const prisma = new PrismaClient({ adapter })
