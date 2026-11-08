import { createPrisma } from '../Db/Client'
import { SQLiteCore } from '../Db/SQLiteCore'
import { Discord } from '../Discord/Discord'
import { VoiceLog } from '../VoiceLog/VoiceLog'
import type { App } from './App'

export function createBot(app: App) {
  const db = new SQLiteCore(createPrisma(app.config.sqlite.databaseUrl), app.mainLogger)
  const discord = new Discord(app.config, app.mainLogger, app.lang, app.audio.providerIds())
  const voiceLog = new VoiceLog(discord, db.serverConfig, app)
  return { db, discord, voiceLog }
}
