import { existsSync as exists, mkdirSync as mkDir } from 'node:fs'
import type { Client, Member, Message, PossiblyUncachedTextableChannel, VoiceChannel } from '@projectdysnomia/dysnomia'
import { scheduleJob } from 'node-schedule'
import type { ILogObj, Logger } from 'tslog'
import type { App } from '../App/App'
import type { Audio } from '../Audio/Audio'
import type { DbServerConfigManager, IServerConfig } from '../Db/ServerConfig'
import type { Discord } from '../Discord/Discord'
import { toMemberView } from '../Discord/Mapping'
import type { Lang } from '../Shared/Lang'
import { CacheRefresh } from './CacheRefresh'
import { VoiceLogCommands } from './CommandHandlers/VoiceLogCommands'
import { genVoiceLogEmbed } from './Embeds'
import { parseMessage } from './MessageText'
import { LogCommand } from './SlashCommands/Log'
import { RefreshCacheCommand } from './SlashCommands/RefreshCache'
import { VoiceCommand } from './SlashCommands/Voice'
import { VoiceLogText } from './Text'
import { VoiceLogVoice } from './VoiceLogVoice'

export class VoiceLog {
  private _voice: VoiceLogVoice
  private _cacheRefresh: CacheRefresh
  private _text: VoiceLogText
  private _command: VoiceLogCommands
  private _logger: Logger<ILogObj>
  private textLogger: Logger<ILogObj>
  private _serverConfig: DbServerConfigManager
  private lang: Lang
  private audio: Audio
  private client: Client
  // Message and join/leave tasks run one at a time in order; a rejected task does not stop the ones after it
  private queueTail: Promise<unknown> = Promise.resolve()
  // Tasks added but not started yet
  private queueLength = 0
  private continuousUser: { [key: string]: { user: string; timestamp: number } } = {}

  constructor(discord: Discord, serverConfig: DbServerConfigManager, app: App) {
    this.client = discord.client
    this._logger = discord.logger.getSubLogger({ name: 'VoiceLog' })
    this.lang = app.lang
    this.audio = app.audio
    this._cacheRefresh = new CacheRefresh(this._logger.getSubLogger({ name: 'Voice' }), app.audio)
    this.textLogger = this._logger.getSubLogger({ name: 'Text' })
    this._serverConfig = serverConfig

    this._voice = new VoiceLogVoice(this, discord, app.audio)
    this._text = new VoiceLogText(this, discord, app.lang)
    this._command = new VoiceLogCommands(this, discord, app.config, app.lang, app.audio)

    this.client.on('messageCreate', (message) => this.onMessage(message))
    this.client.on('voiceChannelJoin', (member: Member, newChannel: VoiceChannel) => this.onJoin(member, newChannel))
    this.client.on('voiceChannelLeave', (member: Member, oldChannel: VoiceChannel) => this.onLeave(member, oldChannel))
    this.client.on('voiceChannelSwitch', (member: Member, newChannel: VoiceChannel, oldChannel: VoiceChannel) => this.onSwitch(member, newChannel, oldChannel))

    discord.command.register(
      (creator) => new VoiceCommand(creator, this, app.lang, app.audio),
      (creator) => new LogCommand(creator, this, app.lang),
      (creator) => new RefreshCacheCommand(creator, this)
    )
    this.client.on('ready', () => this.start())
  }

  private async onMessage(message: Message<PossiblyUncachedTextableChannel>) {
    if (message.guildID === undefined) return
    const guildId = message.guildID
    const data = await this._serverConfig.get(guildId)

    if (!data?.voiceMessageTTS.enabled) return

    this.enqueue(async () => {
      const voice = this._voice.getCurrentVoice(guildId)
      if (voice?.channelId === message.channel.id) {
        const isContinuous = this.continuousUser[guildId]?.user === message.author.id && message.timestamp - this.continuousUser[guildId]?.timestamp < 5 * 1000
        const text = parseMessage(this.client, this.textLogger, message, isContinuous, data.voiceMessageTTS.messageLang, this.lang)

        if (text === '') {
          this._logger.debug('Skipped empty message')
          return
        }

        this._logger.debug(`${message.author} to ${message.channel} ${isContinuous ? '(Continuous)' : ''}: ${text}`)

        const tts = data.voiceMessageTTS
        if (!this.audio.providerIds().includes(tts.provider)) {
          this._logger.error(`Guild ${guildId} uses unknown TTS provider "${tts.provider}", set it again with /voice tts`)
          return
        }
        this.audio.speak(voice.playback, { provider: tts.provider, text, lang: tts.voiceLang, voice: tts.voiceName })
        this.continuousUser[guildId] = {
          user: message.author.id,
          timestamp: message.timestamp
        }
      }
    })
  }

  private async onJoin(member: Member, newChannel: VoiceChannel) {
    if (member.id === this.client.user.id) return
    this.logger.debug(
      `Queue (${this.queueLength + 1}): User ${member.username} (${member.id}) joined voice channel ${newChannel.name} (${newChannel.id}) in guild ${member.guild.name} (${member.guild.id})`
    )
    this.enqueue(async () => {
      this.logger.info(`User ${member.username} (${member.id}) joined voice channel ${newChannel.name} (${newChannel.id}) in guild ${member.guild.name} (${member.guild.id})`)
      await this.publishVoiceEvent(member, undefined, newChannel, 'join', [{ channel: newChannel, type: 'join' }])
    })
  }

  private async onLeave(member: Member, oldChannel: VoiceChannel) {
    if (member.id === this.client.user.id) return
    this.logger.debug(
      `Queue (${this.queueLength + 1}): User ${member.username} (${member.id}) left voice channel ${oldChannel.name} (${oldChannel.id}) in guild ${member.guild.name} (${member.guild.id})`
    )
    this.enqueue(async () => {
      this.logger.info(`User ${member.username} (${member.id}) left voice channel ${oldChannel.name} (${oldChannel.id}) in guild ${member.guild.name} (${member.guild.id})`)
      await this.publishVoiceEvent(member, oldChannel, undefined, 'leave', [{ channel: oldChannel, type: 'left' }])
    })
  }

  private async onSwitch(member: Member, newChannel: VoiceChannel, oldChannel: VoiceChannel) {
    if (member.id === this.client.user.id) {
      this._serverConfig.updateLastVoiceChannel(member.guild.id, newChannel.id)
      this._serverConfig.updateCurrentVoiceChannel(member.guild.id, '')
      return
    }
    this.logger.debug(
      `Queue (${this.queueLength + 1}): User ${member.username} (${member.id}) switched voice channel from ${oldChannel.name} (${oldChannel.id}) to ${newChannel.name} (${newChannel.id}) in guild ${member.guild.name} (${member.guild.id})`
    )
    this.enqueue(async () => {
      this.logger.info(
        `User ${member.username} (${member.id}) switched voice channel from ${oldChannel.name} (${oldChannel.id}) to ${newChannel.name} (${newChannel.id}) in guild ${member.guild.name} (${member.guild.id})`
      )
      await this.publishVoiceEvent(member, oldChannel, newChannel, 'move', [
        { channel: oldChannel, type: 'switched_out' },
        { channel: newChannel, type: 'switched_in' }
      ])
    })
  }

  private resetContinuousSpeaker(guildId: string) {
    this.continuousUser[guildId] = {
      user: this.client.user.id,
      timestamp: 0
    }
  }

  // Shared path of join, leave and switch. Each caller keeps its own log text and passes its event types.
  private async publishVoiceEvent(
    member: Member,
    oldChannel: VoiceChannel | undefined,
    newChannel: VoiceChannel | undefined,
    embedType: string,
    announcements: { channel: VoiceChannel; type: string }[]
  ) {
    const guildId = member.guild.id
    const channelID = await this._voice.autoLeaveChannel(oldChannel, newChannel, guildId)
    const voice = this._voice.getCurrentVoice(guildId)
    const data = await this._serverConfig.get(guildId)

    if (data) {
      if (data.channelID !== '') {
        this.client.createMessage(data.channelID, genVoiceLogEmbed(this.lang, member, data.lang, embedType, oldChannel, newChannel))
      }
    }
    for (const announcement of announcements) {
      if (announcement.channel.id === channelID) {
        if (voice) {
          this.audio.announceMember(voice.playback, toMemberView(member), announcement.type)
          this.resetContinuousSpeaker(guildId)
        }
      }
    }
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    this.queueLength++
    const run = this.queueTail.then(() => {
      this.queueLength--
      return task()
    })
    this.queueTail = run.catch(() => undefined)
    return run
  }

  public get voice() {
    return this._voice
  }

  public get cacheRefresh() {
    return this._cacheRefresh
  }

  public get text() {
    return this._text
  }

  public get command() {
    return this._command
  }

  public get logger() {
    return this._logger
  }

  public get serverConfig() {
    return this._serverConfig
  }

  public async start() {
    if (!exists('./assets')) mkDir('./assets')
    if (!exists('./caches')) mkDir('./caches')
    this.audio.evictCache()
    const channels = await this._serverConfig.getCurrentChannels()
    channels.forEach((element: IServerConfig) => {
      this._logger.info(`Reconnecting to ${element.currentVoiceChannel}...`)
      this._voice.join(element.serverID, element.currentVoiceChannel)
    })
    scheduleJob('0 0 * * *', () => {
      this._cacheRefresh.refreshCache(undefined)
    })
    // Away from the midnight refresh, so expired files are not removed just before it re-reads them
    scheduleJob('0 12 * * *', () => {
      this.audio.evictCache()
    })
  }

  public async end() {
    await this.voice.end()
  }
}
