import { DEFAULT_FLUXER_PREFIX, defaultDiscord, defaultFluxer } from '../Defaults'
import type { DiscordConfig, FluxerInstanceConfig } from '../Types'

export interface RawPlatformConfig {
  platform?: { discord?: Partial<DiscordConfig>; fluxer?: unknown }
  discord?: Partial<DiscordConfig>
  // biome-ignore lint/style/useNamingConvention: Legacy config
  TOKEN?: string
  admins?: string[]
}

export interface MergedFluxerConfig {
  fluxer: FluxerInstanceConfig[]
  // Index in the file of each kept entry, so problems name the entry the user wrote
  positions: number[]
  problems: string[]
}

// platform.discord since version 6; discord, or TOKEN and admins, before
export function mergeDiscordConfig(raw: RawPlatformConfig): DiscordConfig {
  const fallback = defaultDiscord()
  const discord = raw.platform?.discord ?? raw.discord ?? {}
  return {
    // Discord was the only platform before version 6, so an upgraded config keeps it running
    enabled: typeof discord.enabled === 'boolean' ? discord.enabled : fallback.enabled,
    botToken: discord.botToken ? discord.botToken : raw.TOKEN ? raw.TOKEN : fallback.botToken,
    applicationID: discord.applicationID ? discord.applicationID : fallback.applicationID,
    publicKey: discord.publicKey ? discord.publicKey : fallback.publicKey,
    admins: discord.admins ? discord.admins : raw.admins ? raw.admins : fallback.admins
  }
}

// A list that is not a list, or an entry that is not an object, is reported in problems and left out
export function mergeFluxerConfig(raw: RawPlatformConfig): MergedFluxerConfig {
  const fluxer = raw.platform?.fluxer
  if (fluxer === undefined) {
    const instances = defaultFluxer()
    return { fluxer: instances, positions: instances.map((_, index) => index), problems: [] }
  }
  if (!Array.isArray(fluxer)) return { fluxer: [], positions: [], problems: ['platform.fluxer must be a list of instances'] }

  const result: MergedFluxerConfig = { fluxer: [], positions: [], problems: [] }
  ;(fluxer as unknown[]).forEach((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      result.problems.push(`platform.fluxer[${index}] must be an object`)
      return
    }
    const instance = entry as Partial<FluxerInstanceConfig>
    result.fluxer.push({
      id: typeof instance.id === 'string' ? instance.id : '',
      enabled: instance.enabled === true,
      origin: typeof instance.origin === 'string' ? instance.origin : '',
      botToken: typeof instance.botToken === 'string' ? instance.botToken : '',
      admins: Array.isArray(instance.admins) ? instance.admins.filter((admin): admin is string => typeof admin === 'string') : [],
      // Added within config version 6; a missing prefix gets the default
      prefix: typeof instance.prefix === 'string' ? instance.prefix : DEFAULT_FLUXER_PREFIX
    })
    result.positions.push(index)
  })
  return result
}
