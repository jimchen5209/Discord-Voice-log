import { readFileSync as readFile, unlinkSync as unlink } from 'node:fs'
import { instances } from '../../Utils/Instances'
import { prisma } from './Client'

export async function migrateMongoToSqlite(dumpPath: string) {
  const logger = instances.mainLogger.getSubLogger({ name: 'DBMigrate' })

  try {
    logger.info(`Reading MongoDB dump from: ${dumpPath}...`)
    const rawData = readFile(dumpPath, { encoding: 'utf-8' })
    const documents = JSON.parse(rawData)

    // Handle both array of docs or mongoexport object format
    const dataArray = Array.isArray(documents) ? documents : [documents]

    logger.info(`Found ${dataArray.length} documents. Migrating to SQLite...`)

    for (const doc of dataArray) {
      if (!doc?.serverID) {
        logger.warn(`Skipping document without serverID: ${JSON.stringify(doc)}`)
        continue
      }

      const tts = doc.voiceMessageTTS || {
        enabled: false,
        messageLang: 'en_US',
        type: 'WaveNet',
        voiceLang: 'en-US',
        voiceName: 'en-US-Wavenet-A'
      }

      const dbObject = {
        lang: doc.lang,
        channelID: doc.channelID,
        lastVoiceChannel: doc.lastVoiceChannel,
        currentVoiceChannel: doc.currentVoiceChannel,
        ttsEnabled: tts.enabled,
        ttsMessageLang: tts.messageLang,
        ttsType: tts.type,
        ttsVoiceLang: tts.voiceLang,
        ttsVoiceName: tts.voiceName
      }
      await prisma.serverConfig.upsert({
        where: { serverID: doc.serverID },
        update: dbObject,
        create: {
          serverID: doc.serverID,
          ...dbObject
        }
      })
    }
    logger.info('MongoDB dump migration completed!')
    unlink(dumpPath)
  } catch (error) {
    logger.error('MongoDB dump migration failed:', error)
    throw error
  }
}
