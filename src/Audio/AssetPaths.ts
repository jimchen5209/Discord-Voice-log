import { existsSync as exists, readdirSync as readDir } from 'node:fs'
import { extname, join } from 'node:path'
import type { PlatformScope } from '../Platform/Scope'

// Per-member voice settings: <dir>/<userId>.json and <dir>/<userId>_<event>.wav, one dir per scope (data
// version 3). The same user id on two scopes is two different people, so their files never mix.
export const ASSETS_DIR = 'assets'

export function memberAssetDir(scope: PlatformScope) {
  // Discord has a single instance
  return scope.platform === 'discord' ? join(ASSETS_DIR, 'discord') : join(ASSETS_DIR, scope.platform, scope.instanceId)
}

// Every scope directory that exists: assets/discord and assets/fluxer/<instanceId>
function memberAssetDirs() {
  const dirs: string[] = []
  const discord = join(ASSETS_DIR, 'discord')
  if (exists(discord)) dirs.push(discord)
  const fluxer = join(ASSETS_DIR, 'fluxer')
  if (exists(fluxer)) {
    for (const instance of readDir(fluxer, { withFileTypes: true })) {
      if (instance.isDirectory()) dirs.push(join(fluxer, instance.name))
    }
  }
  return dirs.sort()
}

// The <userId>.json of every scope
export function memberConfigFiles() {
  return memberAssetDirs().flatMap((dir) =>
    readDir(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && extname(entry.name) === '.json')
      .map((entry) => join(dir, entry.name))
      .sort()
  )
}

// .json and .wav files left directly in assets/, where nothing reads them since data version 3
export function unreadAssetFiles() {
  if (!exists(ASSETS_DIR)) return []
  return readDir(ASSETS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && ['.json', '.wav'].includes(extname(entry.name)))
    .map((entry) => join(ASSETS_DIR, entry.name))
    .sort()
}
