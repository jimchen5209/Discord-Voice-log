import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { rename, rm, writeFile } from 'node:fs/promises'
import type { AudioFormat } from './AudioAsset'
import type { TTSProvider } from './TTSProvider'

const EXTENSIONS: Record<AudioFormat, string> = { ogg: 'opus', pcm: 'pcm' }

let tempCounter = 0

export class AudioCache {
  private readonly dir: string
  private readonly inFlight = new Map<string, Promise<string | null>>()

  constructor(dir = './caches') {
    this.dir = dir
  }

  public pathFor(provider: TTSProvider, text: string, lang: string, voice = ''): string {
    return `${this.dir}/${createHash('md5').update(`${provider.id}:${text}-${lang}-${voice}`).digest('hex')}.${EXTENSIONS[provider.format]}`
  }

  // Resolves to the cached file path, synthesizing it on a miss; null when synthesis failed.
  // Concurrent misses for the same key share one synthesis and one write.
  public async getOrCreate(provider: TTSProvider, text: string, lang: string, voice = ''): Promise<string | null> {
    const path = this.pathFor(provider, text, lang, voice)
    if (existsSync(path)) return path
    const pending = this.inFlight.get(path)
    if (pending) return pending
    const created = this.create(provider, path, text, lang, voice).finally(() => this.inFlight.delete(path))
    this.inFlight.set(path, created)
    return created
  }

  private async create(provider: TTSProvider, path: string, text: string, lang: string, voice: string): Promise<string | null> {
    const data = await provider.synthesize(text, lang, voice)
    if (data === null) return null
    await this.writeAtomic(path, data)
    return path
  }

  // The cache path only ever holds a complete file: a crash mid-write leaves just a *.tmp file,
  // which never matches a cache key. The temp file must be in the same dir for rename to be atomic.
  private async writeAtomic(path: string, data: Uint8Array) {
    const temp = `${path}.${process.pid}.${++tempCounter}.tmp`
    try {
      await writeFile(temp, data)
      await rename(temp, path)
    } catch (error) {
      await rm(temp, { force: true })
      throw error
    }
  }
}
