import { Status } from 'status-client'
import { createApp } from './App/App'
import { checkPlatforms, createBot, startCacheJobs, startServices } from './App/Bot'
import { unreadAssetFiles } from './Audio/AssetPaths'
import { checkData, warnRemovedDumpEnv } from './Migration'
import { EXIT_NO_RESTART } from './Shared/ExitCode'

let quitting = false
let bot: ReturnType<typeof createBot> | undefined

const app = createApp()
const logger = app.mainLogger
logger.info('Starting...')
if (app.config.debug) app.mainLogger.settings.minLevel = 0 // Silly
if (!checkPlatforms(app)) process.exit(EXIT_NO_RESTART)

const status = new Status('VoiceLog')

async function main() {
  warnRemovedDumpEnv()
  if (!(await checkData())) process.exit(EXIT_NO_RESTART)
  const unread = unreadAssetFiles()
  if (unread.length > 0) {
    logger.warn(`These files are not read since data version 3: ${unread.join(', ')}. Discord member files belong in assets/discord/`)
  }

  // Initialize SQLite
  // Since SQLite/Prisma is synchronous initialization for the client
  // (connection is lazy), we can start the bot immediately.
  bot = createBot(app)

  startCacheJobs(app, bot.cacheRefresh)
  const running = await startServices(app, bot.services)
  if (running.length === 0) {
    logger.fatal('No platform could start')
    process.exit(1)
  }
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

  const platformShutdown = Promise.all(
    (bot?.services ?? []).map(async ({ runtime, voiceLog }) => {
      await voiceLog.end()
      await runtime.stop()
    })
  )

  const dbShutdown = new Promise<void>((resolve) => {
    if (bot?.db) {
      bot.db.close().then(() => resolve())
    } else {
      resolve()
    }
  })

  Promise.all([platformShutdown, dbShutdown]).then(() => {
    clearTimeout(timeout)
    logger.info('All services shut down gracefully. Exiting.')
    process.exit(0)
  })
}

process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
