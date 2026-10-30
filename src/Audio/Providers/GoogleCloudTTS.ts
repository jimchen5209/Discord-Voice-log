import fetch from 'node-fetch'
import type { ILogObj, Logger } from 'tslog'
import type { TTSProvider } from '../TTSProvider'

// Google Cloud Text-to-Speech (WaveNet voices), OGG Opus
export class GoogleCloudTTS implements TTSProvider {
  public readonly id = 'google-cloud'
  public readonly format = 'ogg'
  private logger: Logger<ILogObj>
  private apiKey: () => string

  constructor(apiKey: () => string, logger: Logger<ILogObj>) {
    this.apiKey = apiKey
    this.logger = logger.getSubLogger({ name: 'GoogleCloudTTS' })
  }

  public async synthesize(text: string, lang: string, voice = ''): Promise<Uint8Array | null> {
    const url = `https://content-texttospeech.googleapis.com/v1/text:synthesize?alt=json&key=${this.apiKey()}`
    const options = {
      body: `{"input":{"text":"${text}"},"voice":{"name":"${voice}","languageCode":"${lang}"},"audioConfig":{"audioEncoding":"OGG_OPUS"}}`,
      headers: {
        'Content-Type': 'application/json',
        'X-Origin': 'https://explorer.apis.google.com',
        'X-Referer': 'https://explorer.apis.google.com'
      },
      method: 'POST'
    }
    try {
      const data = await (await fetch(url, options)).json()
      if (!data.audioContent) {
        if (data.error) {
          throw new Error(`Google TTS API Error: ${data.error.message} (Code: ${data.error.code})`)
        }
        throw new Error('Unable to get audio content from response')
      }
      return Buffer.from(data.audioContent, 'base64')
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Download TTS failed: ${error.message}`, error)
      }
      return null
    }
  }
}
