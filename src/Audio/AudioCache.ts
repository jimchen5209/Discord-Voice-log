import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import md5 from 'md5'
import type { AudioFormat } from './AudioAsset'
import type { TTSProvider } from './TTSProvider'

const EXTENSIONS: Record<AudioFormat, string> = { ogg: 'opus', pcm: 'pcm' }

export class AudioCache {
  private readonly dir: string
  private readonly inFlight = new Map<string, Promise<string | null>>()

  constructor(dir = './caches') {
    this.dir = dir
  }

  public pathFor(provider: TTSProvider, text: string, lang: string, voice = ''): string {
    return `${this.dir}/${md5(`${provider.id}:${text}-${lang}-${voice}`)}.${EXTENSIONS[provider.format]}`
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
    await writeFile(path, data)
    return path
  }
}
