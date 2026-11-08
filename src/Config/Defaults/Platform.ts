import type { DiscordConfig, FluxerInstanceConfig, PlatformConfig } from '../Types'

export function defaultDiscord(): DiscordConfig {
  return {
    enabled: true,
    botToken: '',
    applicationID: '',
    publicKey: '',
    admins: []
  }
}

// Used when the file has no platform.fluxer; an empty list stays empty
export function defaultFluxer(): FluxerInstanceConfig[] {
  return [{ id: 'official', enabled: false, origin: 'https://fluxer.com', botToken: '', admins: [], voice: false }]
}

export function defaultPlatform(): PlatformConfig {
  return { discord: defaultDiscord(), fluxer: defaultFluxer() }
}
