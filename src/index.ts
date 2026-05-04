import { Status } from 'status-client'
import { Discord } from './Core/Discord/Core'
import { MongoDB } from './Core/MongoDB/Core'
import { instances } from './Utils/Instances'

let quitting = false

const logger = instances.mainLogger
logger.info('Starting...')
if (instances.config.debug) instances.mainLogger.settings.minLevel = 0 // Silly

const status = new Status('VoiceLog')

// Initialize MongoDB
const mongoDB = new MongoDB()
instances.mongoDB = mongoDB

mongoDB.once('connect', () => {
  // Initialize the bot
  const discord = new Discord()
  instances.discord = discord

  discord.start()
  status.set_status()
})

mongoDB.once('error', () => {
  logger.error('Unable to connect to database. Quitting...')
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

  const discordShutdown = instances.discord?.stop() ?? Promise.resolve()

  const mongoShutdown = new Promise<void>((resolve) => {
    if (instances.mongoDB) {
      instances.mongoDB.once('disconnected', resolve)
      instances.mongoDB.close()
    } else {
      resolve()
    }
  })

  Promise.all([discordShutdown, mongoShutdown]).then(() => {
    clearTimeout(timeout)
    logger.info('All services shut down gracefully. Exiting.')
    process.exit(0)
  })
}

process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
