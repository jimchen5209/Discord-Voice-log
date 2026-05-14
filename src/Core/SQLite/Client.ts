import { PrismaClient } from '@prisma/client'
import { instances } from '../../Utils/Instances'

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: instances.config.sqlite.databaseUrl
    }
  }
})
