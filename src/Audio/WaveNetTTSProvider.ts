import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import fetch, { type RequestInit } from 'node-fetch'
import type { ILogObj, Logger } from 'tslog'
import type { Config } from '../Utils/Config'
import type { AudioCache } from './AudioCache'
import type { TTSProvider } from './TTSProvider'

// Google Cloud Text-to-Speech, stored as OGG Opus
export class WaveNetTTSProvider implements TTSProvider {
  public readonly format = 'ogg'
  private logger: Logger<ILogObj>
  private cache: AudioCache
  private config: Config

  constructor(cache: AudioCache, config: Config, logger: Logger<ILogObj>) {
    this.cache = cache
    this.config = config
    this.logger = logger.getSubLogger({ name: 'WaveNetTTS' })
  }

  public synthesize(text: string, lang: string, voice = ''): Promise<string | null> {
    return this.cache.getOrCreate(`${text}-${lang}-${voice}`, 'opus', (filePath) => {
      const key = this.config.googleTTS.apiKey
      const url = `https://content-texttospeech.googleapis.com/v1/text:synthesize?alt=json&key=${key}`
      const options = {
        body: `{"input":{"text":"${text}"},"voice":{"name":"${voice}","languageCode":"${lang}"},"audioConfig":{"audioEncoding":"OGG_OPUS"}}`,
        headers: {
          'Content-Type': 'application/json',
          'X-Origin': 'https://explorer.apis.google.com',
          'X-Referer': 'https://explorer.apis.google.com'
        },
        method: 'POST'
      }
      return this.download(url, options, filePath)
    })
  }

  private download(url: string, options: RequestInit, path: string): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      fetch(url, options)
        .then((response) => response.json())
        .then((data) => {
          if (!data.audioContent) {
            if (data.error) {
              throw new Error(`Google TTS API Error: ${data.error.message} (Code: ${data.error.code})`)
            }
            throw new Error('Unable to get audio content from response')
          }
          const imgBuffer = Buffer.from(data.audioContent, 'base64')
          const s = new Readable()
          const w = createWriteStream(path)
          w.once('finish', () => {
            resolve(path)
          })
          s.push(imgBuffer)
          s.push(null)

          s.pipe(w)
        })
        .catch((error) => {
          if (error instanceof Error) {
            this.logger.error(`Download TTS failed: ${error.message}`, error)
          }
          resolve(null)
        })
    })
  }
}
