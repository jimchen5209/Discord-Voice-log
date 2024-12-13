import { Discord } from './Core/Discord/Core'
import { MongoDB } from './Core/MongoDB/Core'
import { Status }from 'status-client'
import { instances } from './Utils/Instances'

const logger = instances.mainLogger
logger.info('Starting...')
if (instances.config.debug) instances.mainLogger.settings.minLevel = 0 // Silly

const status = new Status('VoiceLog')

// Initialize MongoDB
const mongoDB = (instances.mongoDB = new MongoDB())

mongoDB.once('connect', () => {
  // Initialize the bot
  const discord = (instances.discord = new Discord())

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
  logger.info('Shutting down...')
  instances.discord?.stop()
  instances.mongoDB?.close()

  // Wait for 5 seconds before force quitting
  setTimeout(() => {
    logger.warn('Force quitting...')
    process.exit(0)
  }, 5 * 1000)
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
