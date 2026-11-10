import { instances } from '../App/App'
import { prisma } from './Client'
import { DbServerConfigManager } from './ServerConfig'

export const ERR_DB_NOT_INIT = Error('Database is not initialized')

export class SQLiteCore {
  private logger = instances.mainLogger.getSubLogger({ name: 'SQLite' })

  constructor() {
    this.logger.info('SQLite client initialized via Prisma')
  }

  public async close() {
    this.logger.info('Closing SQLite connection...')
    await prisma.$disconnect()
  }

  public get serverConfig() {
    return new DbServerConfigManager()
  }
}
