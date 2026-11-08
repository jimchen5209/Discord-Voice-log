import type { PlatformConfig } from './Types'

// Lowercase letters, digits and dashes; "discord" is the instanceId of the Discord scope
export const FLUXER_INSTANCE_ID = /^[a-z0-9-]+$/

// A command is the prefix, then whitespace or the end of the message
export const FLUXER_PREFIX = /^\S{1,16}$/

export function isHttpsOrigin(origin: string) {
  try {
    return new URL(origin).protocol === 'https:'
  } catch {
    return false
  }
}

// Problems in a config that would mix up scopes or send a token to the wrong place.
// Never includes a token. positions[i] is where platform.fluxer[i] sits in the file, when entries were skipped.
export function validatePlatform(platform: PlatformConfig, positions?: number[]): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  platform.fluxer.forEach((instance, index) => {
    const name = `platform.fluxer[${positions?.[index] ?? index}]`
    if (!FLUXER_INSTANCE_ID.test(instance.id)) problems.push(`${name}.id ${JSON.stringify(instance.id)} must use only a-z, 0-9 and -`)
    else if (instance.id === 'discord') problems.push(`${name}.id cannot be "discord"`)
    else if (seen.has(instance.id)) problems.push(`${name}.id "${instance.id}" is used twice`)
    seen.add(instance.id)
    if (!isHttpsOrigin(instance.origin)) problems.push(`${name}.origin ${JSON.stringify(instance.origin)} must be an https:// URL`)
    if (instance.enabled && !instance.botToken) problems.push(`${name} is enabled but has no botToken`)
    if (!FLUXER_PREFIX.test(instance.prefix)) problems.push(`${name}.prefix ${JSON.stringify(instance.prefix)} must be 1 to 16 characters without spaces`)
  })
  return problems
}
