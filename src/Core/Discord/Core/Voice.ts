import { existsSync as exists, readFileSync as readFile } from 'node:fs'
import { waitUntil } from 'async-wait-until'
import type { Client, Member, VoiceConnection } from 'eris'
import Queue from 'promise-queue'
import type { ILogObj, Logger } from 'tslog'
import { instances } from '../../../Utils/Instances'
import type { Discord } from '../Core'

export class DiscordVoice {
  private _init = true
  private _channelId: string
  private queue: Queue = new Queue(1, Infinity)
  private client: Client
  private voice: VoiceConnection | undefined
  private logger: Logger<ILogObj>

  constructor(discord: Discord, channel: string, voice: VoiceConnection | undefined = undefined) {
    this.client = discord.client
    this.logger = discord.logger.getSubLogger({
      name: 'Voice',
      prefix: [`[${channel}]`]
    })

    this._channelId = channel

    if (voice?.ready) {
      this.voice = voice
      this._init = false
      this.logger.info('Using the existing voice connection')
    } else {
      this.joinVoiceChannel(channel).then((connection) => {
        this.voice = connection
        if (connection) {
          this._init = false
          this.logger.info('Connected')
        }
      })
    }
  }

  public switchChannel(channel: string) {
    this.destroy()

    this._channelId = channel

    this.joinVoiceChannel(channel).then((connection) => {
      this.voice = connection
    })
  }

  public get channelId() {
    return this._channelId
  }

  public get init() {
    return this._init
  }

  public async playReady() {
    const voiceFile = await instances.ttsHelper.getWaveTTS('VoiceLog is ready.', 'en-US', 'en-US-Wavenet-D')
    if (voiceFile !== null) this.queue.add(() => this.play(voiceFile, 'ogg'))
  }

  public async playMoved() {
    const voiceFile = await instances.ttsHelper.getWaveTTS('VoiceLog is moved to your channel.', 'en-US', 'en-US-Wavenet-D')
    if (voiceFile !== null) this.queue.add(() => this.play(voiceFile, 'ogg'))
  }

  public async playVoice(member: Member, type: string) {
    let overwritten = false

    for (const voice of instances.pluginManager.voiceOverwrites) {
      const overwrittenFile = await voice.playVoice(member, type)
      if (overwrittenFile) {
        this.queue.add(() => this.play(overwrittenFile, 'pcm'))
        overwritten = true
        break
      }
    }

    if (overwritten) return

    let voiceFile = ''
    let format: string | undefined
    if (exists(`assets/${member.id}.json`)) {
      const tts = JSON.parse(readFile(`assets/${member.id}.json`, { encoding: 'utf-8' }))
      if (tts.use_wave_tts && tts.lang && tts.voice && tts[type]) {
        voiceFile = await instances.ttsHelper.getWaveTTS(tts[type], tts.lang, tts.voice)
        format = 'ogg'
      } else if (tts.lang && tts[type]) {
        const file = await instances.ttsHelper.getTTSFile(tts[type], tts.lang)
        if (file !== null) {
          voiceFile = file
          format = 'pcm'
        } else if (exists(`assets/${member.id}_${type}.wav`)) {
          voiceFile = `assets/${member.id}_${type}.wav`
        }
      } else if (exists(`assets/${member.id}_${type}.wav`)) {
        voiceFile = `assets/${member.id}_${type}.wav`
      }
    } else if (exists(`assets/${member.id}_${type}.wav`)) {
      voiceFile = `assets/${member.id}_${type}.wav`
    }
    if (voiceFile !== '') this.queue.add(() => this.play(voiceFile, format))
  }

  public isReady(): boolean {
    return this.voice?.ready ?? false
  }

  public destroy() {
    if (this.voice) {
      this.logger.info('Ending voice connection...')
      this.voice.stopPlaying()
      this.voice.removeAllListeners()
      if (this.voice.channelID) this.client.leaveVoiceChannel(this.voice.channelID)
      this.voice = undefined
    }
  }

  private async joinVoiceChannel(channelID: string): Promise<VoiceConnection | undefined> {
    this.logger.info('Connecting...')
    try {
      const connection = await this.client.joinVoiceChannel(channelID)
      connection.on('warn', (message: string) => {
        this.logger.warn(message)
      })
      connection.on('error', (err) => {
        this.logger.error(err.message, err)
      })
      connection.on('debug', (message) => this.logger.debug(message))
      connection.once('ready', () => {
        this.logger.error('Voice connection reconnected.')
        const channelId = connection.channelID
        if (channelId) {
          if (channelId !== this._channelId) {
            this._channelId = channelId
            this.logger.settings.prefix = [`[${channelId}]`]
            this.logger.warn(`Voice channel changed from ${this._channelId} to ${channelId}`)
          }
          this.switchChannel(channelId)
        }
      })
      connection.once('disconnect', (err) => {
        this.logger.error(err?.message, err)
        connection.stopPlaying()
        this.client.leaveVoiceChannel(channelID)
        this.logger.warn('Trying to reconnect in 5 seconds...')
        setTimeout(() => {
          this.joinVoiceChannel(this._channelId || channelID).then((newConnection) => {
            this.voice = newConnection
          })
        }, 5 * 1000)
      })
      return connection
    } catch (e) {
      if (e instanceof Error) {
        this.logger.error(`${e.name} - ${e.message}`, e)
      }
    }
  }

  private play(file: string, format: string | undefined = undefined) {
    // biome-ignore lint/suspicious/noAsyncPromiseExecutor: Usage of await
    return new Promise<void>(async (res) => {
      if (file === '') {
        res()
        return
      }
      this.logger.info(`Playing ${file}`)
      try {
        await waitUntil(() => this.voice?.ready)
      } catch (error) {
        this.logger.error('Voice timed out, trying to reconnect', error)
        return
      }
      this.voice?.once('end', () => res())
      this.voice?.play(file, { format, inlineVolume: true })
    })
  }
}
