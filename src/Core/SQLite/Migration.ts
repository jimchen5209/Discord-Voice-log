import { readFileSync as readFile, unlinkSync as unlink } from 'node:fs'
import { PrismaClient } from '@prisma/client'
import { instances } from '../../Utils/Instances'

export async function migrateMongoToSqlite(dumpPath: string) {
  const prisma = new PrismaClient()
  const logger = instances.mainLogger.getSubLogger({ name: 'DBMigrate' })

  try {
    logger.info(`Reading MongoDB dump from: ${dumpPath}...`)
    const rawData = readFile(dumpPath, { encoding: 'utf-8' })
    const documents = JSON.parse(rawData)

    // Handle both array of docs or mongoexport object format
    const dataArray = Array.isArray(documents) ? documents : Object.values(documents)

    logger.info(`Found ${dataArray.length} documents. Migrating to SQLite...`)

    for (const doc of dataArray) {
      const tts = doc.voiceMessageTTS || {
        enabled: false,
        messageLang: 'en_US',
        type: 'WaveNet',
        voiceLang: 'en-US',
        voiceName: 'en-US-Wavenet-A'
      }

      await prisma.serverConfig.upsert({
        where: { serverID: doc.serverID },
        update: {
          lang: doc.lang,
          channelID: doc.channelID,
          lastVoiceChannel: doc.lastVoiceChannel,
          currentVoiceChannel: doc.currentVoiceChannel,
          ttsEnabled: tts.enabled,
          ttsMessageLang: tts.messageLang,
          ttsType: tts.type,
          ttsVoiceLang: tts.voiceLang,
          ttsVoiceName: tts.voiceName
        },
        create: {
          serverID: doc.serverID,
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
      })
    }
    logger.info('MongoDB dump migration completed!')
    unlink(dumpPath)
  } catch (error) {
    logger.error('MongoDB dump migration failed:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}
