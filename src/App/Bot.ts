import { createPrisma } from '../Db/Client'
import { SQLiteCore } from '../Db/SQLiteCore'
import { assertDiscordToken, Discord } from '../Discord/Discord'
import type { PlatformRuntime } from '../Platform/Runtime'
import { VoiceLog } from '../VoiceLog/VoiceLog'
import type { App } from './App'

// One running platform runtime and the VoiceLog on it
export interface PlatformService {
  runtime: PlatformRuntime
  voiceLog: VoiceLog
}

// Run before anything connects. Returns false (after logging why) when no platform would run.
export function checkPlatforms(app: App) {
  const { discord, fluxer } = app.config.platform
  const logger = app.mainLogger
  for (const instance of fluxer.filter((instance) => instance.enabled)) {
    logger.warn(`Fluxer instance "${instance.id}" is enabled, but this version has no Fluxer runtime yet; it is ignored`)
  }
  if (!discord.enabled) {
    logger.fatal('No platform is enabled (platform.discord.enabled is false); nothing to run')
    return false
  }
  assertDiscordToken(app.config)
  return true
}

export function createBot(app: App) {
  const db = new SQLiteCore(createPrisma(app.config.sqlite.databaseUrl), app.mainLogger)
  const services: PlatformService[] = []
  if (app.config.platform.discord.enabled) {
    const discord = new Discord(app.config, app.mainLogger, app.lang, app.audio.providerIds())
    services.push({ runtime: discord, voiceLog: new VoiceLog(discord, db.serverConfig, app) })
  }
  return { db, services }
}
