import { existsSync } from 'node:fs'
import md5 from 'md5'

export type AudioProducer = (path: string) => Promise<string | null>

export class AudioCache {
  private readonly dir: string

  constructor(dir = './caches') {
    this.dir = dir
  }

  public pathFor(rawKey: string, ext: string): string {
    return `${this.dir}/${md5(rawKey)}.${ext}`
  }

  public async getOrCreate(rawKey: string, ext: string, produce: AudioProducer): Promise<string | null> {
    const path = this.pathFor(rawKey, ext)
    if (existsSync(path)) return path
    return await produce(path)
  }
}
