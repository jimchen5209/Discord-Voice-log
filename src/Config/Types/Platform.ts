export interface PlatformConfig {
  discord: DiscordConfig
  fluxer: FluxerInstanceConfig[]
}

export interface DiscordConfig {
  enabled: boolean
  botToken: string
  applicationID: string
  publicKey: string
  admins: string[]
}

// One Fluxer instance (official or self-hosted). id is the stable instanceId stored with its data:
// never derive it from the origin, and never change it once the instance has data.
export interface FluxerInstanceConfig {
  id: string
  enabled: boolean
  origin: string
  botToken: string
  admins: string[]
}
