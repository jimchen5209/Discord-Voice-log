import { Status } from 'status-client'
import { createApp } from './App/App'
import { createBot } from './App/Bot'
import { assertDiscordToken } from './Discord/Discord'
import { checkData, warnRemovedDumpEnv } from './Migration'
import { EXIT_NO_RESTART } from './Shared/ExitCode'

let quitting = false
let bot: ReturnType<typeof createBot> | undefined

const app = createApp()
const logger = app.mainLogger
logger.info('Starting...')
if (app.config.debug) app.mainLogger.settings.minLevel = 0 // Silly
assertDiscordToken(app.config)

const status = new Status('VoiceLog')

async function main() {
  warnRemovedDumpEnv()
  if (!(await checkData())) process.exit(EXIT_NO_RESTART)

  // Initialize SQLite
  // Since SQLite/Prisma is synchronous initialization for the client
  // (connection is lazy), we can start the bot immediately.
  bot = createBot(app)

  bot.discord.start()
  status.set_status()
}

main().catch((err) => {
  app.mainLogger.fatal(err)
  process.exit(1)
})

process.on('warning', (e) => {
  logger.warn(e.message)
})

// Graceful shutdown
const stop = () => {
  console.log()
  if (quitting) {
    logger.warn('Force quitting...')
    process.exit(1)
  }

  logger.info('Shutting down...')
  quitting = true

  const timeout = setTimeout(() => {
    logger.warn('Graceful shutdown timed out. Force quitting...')
    process.exit(1)
  }, 60 * 1000)

  const discordShutdown = (async () => {
    await bot?.voiceLog.end()
    await bot?.discord.stop()
  })()

  const dbShutdown = new Promise<void>((resolve) => {
    if (bot?.db) {
      bot.db.close().then(() => resolve())
    } else {
      resolve()
    }
  })

  Promise.all([discordShutdown, dbShutdown]).then(() => {
    clearTimeout(timeout)
    logger.info('All services shut down gracefully. Exiting.')
    process.exit(0)
  })
}

process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
