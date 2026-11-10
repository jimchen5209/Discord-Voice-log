import { existsSync as exists, readFileSync as readFile } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { ILogObj, Logger } from 'tslog'
import { getApp } from '../App/App'
import { writeAtomic } from '../Shared/WriteAtomic'

let _logger: Logger<ILogObj> | undefined
const logger = () => (_logger ??= getApp().mainLogger.getSubLogger({ name: 'DataMigration' }))

// Version of the app-side data format (assets/<id>.json). The database is versioned by Prisma's
// migration history instead. Bump it only for a breaking change, at most once per PR, and add exactly
// one step for the bump to ASSET_STEPS.
export const DATA_VERSION = 2

// data-version.json: the data version the app-side data was last migrated to
const RECORD_FILE = 'data-version.json'

export type VersionRecord = { kind: 'none' } | { kind: 'ok'; version: number } | { kind: 'invalid'; reason: string }

// The record lives next to the SQLite database file
export function recordFilePath() {
  return resolve(dirname(databasePath()), RECORD_FILE)
}

export function databasePath() {
  const url = getApp().config.sqlite.databaseUrl
  if (!url.startsWith('file:')) throw new Error(`Unsupported database URL ${url}`)
  return resolve(url.slice('file:'.length).split('?')[0])
}

export function readRecord(path: string): VersionRecord {
  if (!exists(path)) return { kind: 'none' }
  let version: unknown
  try {
    version = JSON.parse(readFile(path, { encoding: 'utf-8' }))?.version
  } catch {
    return { kind: 'invalid', reason: `${path} is not valid JSON` }
  }
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { kind: 'invalid', reason: `${path} has no valid "version" (expected a positive integer, got ${JSON.stringify(version)})` }
  }
  return { kind: 'ok', version }
}

export async function writeRecord(path: string, version: number) {
  await writeAtomic(path, `${JSON.stringify({ version }, null, 2)}\n`)
}

// A data version record that is missing or at most DATA_VERSION
export type UsableRecord = Exclude<VersionRecord, { kind: 'invalid' }>

// The record, or undefined (after logging an error ending in `outcome`) when it is malformed or newer
// than DATA_VERSION, which nothing in this build may act on
export function readUsableRecord(path: string, outcome: string): UsableRecord | undefined {
  const record = readRecord(path)
  if (record.kind === 'invalid') {
    logger().error(`${record.reason}; ${outcome}`)
    return undefined
  }
  if (record.kind === 'ok' && record.version > DATA_VERSION) {
    logger().error(`${path} says data version ${record.version}, newer than this build (${DATA_VERSION}); ${outcome}. Downgrades are not supported`)
    return undefined
  }
  return record
}
