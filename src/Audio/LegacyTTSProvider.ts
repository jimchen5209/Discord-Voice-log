import { writeFile } from 'node:fs/promises'
import type { MPEGDecoderWebWorker } from 'mpg123-decoder'
import fetch from 'node-fetch'
import type { ILogObj, Logger } from 'tslog'
import type { AudioCache } from './AudioCache'
import type { TTSProvider } from './TTSProvider'

// Google Translate TTS, decoded to 48kHz stereo s16 PCM
export class LegacyTTSProvider implements TTSProvider {
  public readonly format = 'pcm'
  private logger: Logger<ILogObj>
  private cache: AudioCache
  private mp3Decoder: MPEGDecoderWebWorker

  constructor(cache: AudioCache, logger: Logger<ILogObj>) {
    this.cache = cache
    this.logger = logger.getSubLogger({ name: 'LegacyTTS' })
    this.mp3Decoder = new (require('fix-esm').require('mpg123-decoder').MPEGDecoderWebWorker)()
  }

  public synthesize(text: string, lang: string): Promise<string | null> {
    return this.cache.getOrCreate(`${text}-${lang}`, 'pcm', (filePath) => this.download(text, lang, filePath))
  }

  private async download(text: string, lang: string, filePath: string): Promise<string | null> {
    const ttsURL = encodeURI(`https://translate.google.com.tw/translate_tts?ie=UTF-8&q=${text}&tl=${lang}&client=tw-ob`)
    try {
      const res = await fetch(ttsURL)
      if (res.ok) {
        const mp3 = res.arrayBuffer()
        await this.mp3Decoder.ready

        // Decode mp3 to PCM 24kHz mono f32
        const { channelData } = await this.mp3Decoder.decode(new Uint8Array(await mp3))
        await this.mp3Decoder.reset()

        // Covent to 48kHz stereo s16
        const pcm = new Int16Array(channelData[0].length * 4)
        let temp = 0
        channelData[0].forEach((v, index) => {
          const i = v < 0 ? v * 0x8000 : v * 0x7fff // f32 to s16

          // Linear interpolation
          const i1 = Math.round((temp + i) / 2)
          const i2 = Math.round(i)
          temp = i

          pcm.set([i1, i1, i2, i2], index * 4) // 24kHz mono to 48kHz stereo
        })
        await writeFile(filePath, pcm)
      } else {
        this.logger.error(`TTS ${text} in ${lang} download failed. response code: ${res.status}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`TTS ${text} in ${lang} download failed: ${error.message}`, error)
      }
      return null
    }
    // Known issue (phase B): returned even when the response was not ok
    return filePath
  }
}
