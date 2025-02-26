import { createWriteStream, existsSync } from 'fs'
import { ILogObj, Logger } from 'tslog'
import md5 from 'md5'
import fetch, { RequestInit } from 'node-fetch'
import { Readable } from 'stream'
import { Config } from './Config'
import { MPEGDecoderWebWorker } from 'mpg123-decoder'
import { writeFile } from 'fs/promises'

export class TTSHelper {
  private logger: Logger<ILogObj>
  private config: Config
  private mp3Decoder: MPEGDecoderWebWorker

  constructor(config: Config, mainLogger: Logger<ILogObj>) {
    this.logger = mainLogger.getSubLogger({ name: 'TTSHelper' })
    this.config = config

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    this.mp3Decoder = new (require('fix-esm').require(
      'mpg123-decoder'
    ).MPEGDecoderWebWorker)()
  }

  public async getTTSFile(text: string, lang: string): Promise<string | null> {
    const filePath = `./caches/${md5(`${text}-${lang}`)}.pcm`
    if (!existsSync(filePath)) {
      const ttsURL = encodeURI(
        `https://translate.google.com.tw/translate_tts?ie=UTF-8&q=${text}&tl=${lang}&client=tw-ob`
      )
      try {
        const res = await fetch(ttsURL)
        if (res.ok) {
          const mp3 = res.arrayBuffer()
          await this.mp3Decoder.ready

          // Decode mp3 to PCM 24kHz mono f32
          const { channelData } = await this.mp3Decoder.decode(
            new Uint8Array(await mp3)
          )
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
          this.logger.error(
            `TTS ${text} in ${lang} download failed. response code: ${res.status}`
          )
        }
      } catch (error) {
        if (error instanceof Error) {
          this.logger.error(
            `TTS ${text} in ${lang} download failed: ${error.message}`,
            error
          )
        }
        return null
      }
    }
    return filePath
  }

  public async getWaveTTS(
    text: string,
    lang: string,
    voice: string
  ): Promise<string | null> {
    const filePath = `./caches/${md5(`${text}-${lang}-${voice}`)}.opus`
    if (!existsSync(filePath)) {
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
      return await this.downloadWaveTTS(url, options, filePath)
    }
    return filePath
  }

  private async downloadWaveTTS(
    url: string,
    options: RequestInit,
    path: string
  ) {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise<string | null>(async (res) => {
      await fetch(url, options)
        .then((response) => response.json())
        .then((data) => {
          const imgBuffer = Buffer.from(data.audioContent, 'base64')

          const s = new Readable()
          const w = createWriteStream(path)

          w.once('finish', () => {res(path)})
          s.push(imgBuffer)
          s.push(null)

          s.pipe(w)
        })
        .catch((error) => {
          if (error instanceof Error) {
            this.logger.error(
              `Download TTS failed: ${error.message}`,
              error
            )
          }
          res(null)
        })
    })
  }
}
