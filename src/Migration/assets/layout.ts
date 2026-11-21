// Where the asset files live. Frozen per data version like the formats in steps.ts: never change what a
// version means, add a new version instead.
// - Versions 1 and 2: assets/<id>.json and assets/<id>_<event>.wav, all Discord.
// - Version 3: one directory per scope, assets/discord/ and assets/fluxer/<instanceId>/, with the same names.
import { existsSync as exists, mkdirSync as mkDir, readdirSync as readDir, renameSync as rename, statSync as stat } from 'node:fs'
import { extname, join } from 'node:path'

export const ASSETS_DIR = 'assets'
export const LAYOUT_VERSION = 3
const DISCORD_DIR = 'discord'
const FLUXER_DIR = 'fluxer'
// What the move to version 3 takes from assets/: the files the bot read there
const MEMBER_FILE_EXTENSIONS = ['.json', '.wav']

// The scope directories that exist at version 3 or later, relative to ASSETS_DIR
export function scopeDirs(): string[] {
  const dirs: string[] = []
  if (isDir(join(ASSETS_DIR, DISCORD_DIR))) dirs.push(DISCORD_DIR)
  const fluxer = join(ASSETS_DIR, FLUXER_DIR)
  if (isDir(fluxer)) {
    for (const entry of readDir(fluxer, { withFileTypes: true })) if (entry.isDirectory()) dirs.push(join(FLUXER_DIR, entry.name))
  }
  return dirs.sort()
}

function isDir(path: string) {
  return exists(path) && stat(path).isDirectory()
}

function topLevelFiles() {
  if (!exists(ASSETS_DIR)) return []
  return readDir(ASSETS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort()
}

// The files directly in assets/ that the move to version 3 takes (names)
export function legacyMemberFiles() {
  return topLevelFiles().filter((file) => MEMBER_FILE_EXTENSIONS.includes(extname(file)))
}

// The other files directly in assets/, which it leaves where they are (paths)
export function unmovedFiles() {
  return topLevelFiles()
    .filter((file) => !MEMBER_FILE_EXTENSIONS.includes(extname(file)))
    .map((file) => join(ASSETS_DIR, file))
}

// Why the move cannot run; checked before anything is changed. A file in both places is a conflict,
// so nothing is overwritten. Only reads.
export function layoutProblems(): string[] {
  const target = join(ASSETS_DIR, DISCORD_DIR)
  if (exists(target) && !isDir(target)) return [`${target} exists and is not a directory`]
  return legacyMemberFiles()
    .filter((file) => exists(join(target, file)))
    .map((file) => `${join(ASSETS_DIR, file)} and ${join(target, file)} both exist`)
}

// Moves the legacy files into assets/discord/ by renaming them (same file system, nothing is copied). A
// file that is already moved is no longer in assets/, so running it again finishes an interrupted move.
export function moveToDiscordDir() {
  const target = join(ASSETS_DIR, DISCORD_DIR)
  const moved: string[] = []
  const failed: { file: string; error: unknown }[] = []
  const files = legacyMemberFiles()
  if (files.length === 0) return { moved, failed }
  mkDir(target, { recursive: true })
  for (const file of files) {
    const from = join(ASSETS_DIR, file)
    const to = join(target, file)
    try {
      // rename overwrites on POSIX; layoutProblems ruled that out, so a target now is a new conflict
      if (exists(to)) throw new Error(`${to} already exists`)
      rename(from, to)
      moved.push(file)
    } catch (error) {
      failed.push({ file: from, error })
    }
  }
  return { moved, failed }
}
