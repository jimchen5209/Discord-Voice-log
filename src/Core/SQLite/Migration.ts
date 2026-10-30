import { readFileSync as readFile, unlinkSync as unlink } from 'node:fs'
import { instances } from '../../Utils/Instances'
import { prisma } from './Client'
import { DEFAULT_TTS_PROVIDER } from './db/ServerConfig'

// MongoDB dumps store the TTS engine name, SQLite stores the provider id
const MONGO_TTS_PROVIDERS = new Map([
  ['WaveNet', 'google-cloud'],
  ['Legacy', 'google-translate']
])

export async function migrateMongoToSqlite(dumpPath: string) {
  const logger = instances.mainLogger.getSubLogger({ name: 'DBMigrate' })

  try {
    logger.info(`Reading MongoDB dump from: ${dumpPath}...`)
    const rawData = readFile(dumpPath, { encoding: 'utf-8' }).trim()
    let documents: unknown
    if (rawData.startsWith('[')) {
      documents = JSON.parse(rawData)
    } else if (rawData.includes('\n')) {
      documents = rawData
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line))
    } else {
      documents = JSON.parse(rawData)
    }

    // Handle both array of docs or mongoexport object format
    const dataArray = Array.isArray(documents) ? documents : [documents]

    logger.info(`Found ${dataArray.length} documents. Migrating to SQLite...`)

    for (const doc of dataArray) {
      if (!doc?.serverID) {
        logger.warn(`Skipping document without serverID: ${JSON.stringify(doc)}`)
        continue
      }

      const tts = {
        enabled: false,
        messageLang: 'en_US',
        voiceLang: 'en-US',
        voiceName: 'en-US-Wavenet-A',
        ...doc.voiceMessageTTS
      }
      let ttsProvider = DEFAULT_TTS_PROVIDER
      if (typeof tts.type === 'string') {
        ttsProvider = MONGO_TTS_PROVIDERS.get(tts.type) ?? tts.type
        if (!MONGO_TTS_PROVIDERS.has(tts.type)) logger.warn(`Guild ${doc.serverID} has unknown TTS type "${tts.type}"; kept as-is, set it again with /voice tts`)
      }

      const dbObject = {
        lang: doc.lang ?? 'en_US',
        channelID: doc.channelID ?? '',
        lastVoiceChannel: doc.lastVoiceChannel ?? '',
        currentVoiceChannel: doc.currentVoiceChannel ?? '',
        ttsEnabled: tts.enabled ?? false,
        ttsMessageLang: tts.messageLang ?? 'en_US',
        ttsProvider,
        ttsVoiceLang: tts.voiceLang ?? 'en-US',
        ttsVoiceName: tts.voiceName ?? 'en-US-Wavenet-A'
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
    try {
      unlink(dumpPath)
    } catch (unlinkError: unknown) {
      logger.warn(`Failed to delete MongoDB dump file at ${dumpPath}:`, unlinkError)
    }
  } catch (error) {
    logger.error('MongoDB dump migration failed:', error)
    throw error
  }
}
