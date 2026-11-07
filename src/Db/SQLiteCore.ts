import type { PrismaClient } from '@prisma/client'
import type { ILogObj, Logger } from 'tslog'
import { DbServerConfigManager } from './ServerConfig'

export class SQLiteCore {
  private logger: Logger<ILogObj>
  private serverConfigLogger: Logger<ILogObj>
  private prisma: PrismaClient

  constructor(prisma: PrismaClient, mainLogger: Logger<ILogObj>) {
    this.prisma = prisma
    this.logger = mainLogger.getSubLogger({ name: 'SQLite' })
    this.serverConfigLogger = mainLogger.getSubLogger({ name: 'SQLite:ServerConfig' })
    this.logger.info('SQLite client initialized via Prisma')
  }

  public async close() {
    this.logger.info('Closing SQLite connection...')
    await this.prisma.$disconnect()
  }

  public get serverConfig() {
    return new DbServerConfigManager(this.prisma, this.serverConfigLogger)
  }
}
