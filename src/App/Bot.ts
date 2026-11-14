import { existsSync as exists, mkdirSync as mkDir } from 'node:fs'
import { scheduleJob } from 'node-schedule'
import { createPrisma } from '../Db/Client'
import { SQLiteCore } from '../Db/SQLiteCore'
import { assertDiscordToken, Discord } from '../Discord/Discord'
import { Fluxer } from '../Fluxer/Fluxer'
import type { PlatformRuntime } from '../Platform/Runtime'
import { CacheRefresh } from '../VoiceLog/CacheRefresh'
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
  if (!discord.enabled && !fluxer.some((instance) => instance.enabled)) {
    logger.fatal('No platform is enabled (platform.discord and every platform.fluxer instance are disabled); nothing to run')
    return false
  }
  if (discord.enabled) assertDiscordToken(app.config)
  return true
}

export function createBot(app: App) {
  const db = new SQLiteCore(createPrisma(app.config.sqlite.databaseUrl), app.mainLogger)
  // One for every platform: the TTS cache is shared by every scope
  const cacheRefresh = new CacheRefresh(app.mainLogger.getSubLogger({ name: 'CacheRefresh' }), app.audio)
  const services: PlatformService[] = []
  if (app.config.platform.discord.enabled) {
    const discord = new Discord(app.config, app.mainLogger, app.lang, app.audio.providerIds())
    services.push({ runtime: discord, voiceLog: new VoiceLog(discord, db.serverConfig, cacheRefresh, app) })
  }
  for (const instance of app.config.platform.fluxer.filter((instance) => instance.enabled)) {
    const fluxer = new Fluxer(instance, app.mainLogger, app.lang, app.audio.providerIds())
    services.push({ runtime: fluxer, voiceLog: new VoiceLog(fluxer, db.serverConfig, cacheRefresh, app) })
  }
  return { db, services, cacheRefresh }
}

// Once for all platforms, before any of them starts
export function startCacheJobs(app: App, cacheRefresh: CacheRefresh) {
  if (!exists('./caches')) mkDir('./caches')
  app.audio.evictCache()
  scheduleJob('0 0 * * *', () => {
    cacheRefresh.refreshCache(undefined)
  })
  // Away from the midnight refresh, so expired files are not removed just before it re-reads them
  scheduleJob('0 12 * * *', () => {
    app.audio.evictCache()
  })
}

// A Fluxer instance that fails to start is logged and left offline; the other platforms keep running.
// Discord failing to start rejects, as before Fluxer existed, so the process exits and is restarted.
// Returns the services that are running.
export async function startServices(app: App, services: PlatformService[]) {
  const results = await Promise.allSettled(services.map(({ runtime }) => runtime.start()))
  const running: PlatformService[] = []
  results.forEach((result, index) => {
    const service = services[index]
    if (result.status === 'fulfilled') {
      running.push(service)
      return
    }
    const { platform, instanceId } = service.runtime.scope
    if (platform === 'discord') throw result.reason
    // A Fluxer runtime cleans up after itself when start() rejects
    app.mainLogger.error(`Fluxer instance "${instanceId}" failed to start and stays offline:`, result.reason)
  })
  return running
}
