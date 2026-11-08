export type PlatformName = 'discord' | 'fluxer'

// One platform runtime; Discord has a single fixed instance
export interface PlatformScope {
  platform: PlatformName
  instanceId: string
}

// Raw ids stay strings; the same id on two scopes is two different guilds
export interface GuildKey extends PlatformScope {
  guildId: string
}

export interface ChannelRef {
  scope: GuildKey
  channelId: string
}

export function guildKeyString(key: GuildKey) {
  return `${key.platform}:${key.instanceId}:${key.guildId}`
}
