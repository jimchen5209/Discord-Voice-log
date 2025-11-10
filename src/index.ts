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
  let discordEnded = false
  let mongoDBEnded = false
  instances.discord?.stop().then(() => {
    discordEnded = true
  })
  instances.mongoDB?.close()
  quitting = true

  instances.mongoDB?.once('disconnected', () => {
    mongoDBEnded = true
  })

  setInterval(() => {
    if (discordEnded && mongoDBEnded) {
      process.exit(0)
    }
  }, 500)
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
