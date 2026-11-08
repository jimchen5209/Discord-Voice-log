import { existsSync as exists, mkdirSync as mkDir } from 'node:fs'
import type { ILogObj, Logger } from 'tslog'
import type { App } from '../App/App'
import { memberAssetDir } from '../Audio/AssetPaths'
import type { Audio } from '../Audio/Audio'
import type { DbServerConfigManager, IServerConfig } from '../Db/ServerConfig'
import type { PlatformRuntime } from '../Platform/Runtime'
import { type GuildKey, guildKeyString } from '../Platform/Scope'
import type { ChannelView, MemberView, MessageView, VoicePresenceChange } from '../Platform/Views'
import type { Lang } from '../Shared/Lang'
import type { CacheRefresh } from './CacheRefresh'
import { VoiceLogCommands } from './CommandHandlers/VoiceLogCommands'
import { genVoiceLogEmbed } from './Embeds'
import { parseMessage } from './MessageText'
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
  private platform: PlatformRuntime
  // Message and join/leave tasks run one at a time in order; a rejected task does not stop the ones after it
  private queueTail: Promise<unknown> = Promise.resolve()
  // Tasks added but not started yet
  private queueLength = 0
  // Keyed by guildKeyString
  private continuousUser: { [key: string]: { user: string; timestamp: number } } = {}

  constructor(platform: PlatformRuntime, serverConfig: DbServerConfigManager, cacheRefresh: CacheRefresh, app: App) {
    this.platform = platform
    this._logger = platform.logger.getSubLogger({ name: 'VoiceLog' })
    this.lang = app.lang
    this.audio = app.audio
    // Shared by every platform: one refresh at a time over the files of every scope
    this._cacheRefresh = cacheRefresh
    this.textLogger = this._logger.getSubLogger({ name: 'Text' })
    this._serverConfig = serverConfig

    this._voice = new VoiceLogVoice(this, platform.voice, app.audio)
    this._text = new VoiceLogText(this, platform.text, app.lang)
    this._command = new VoiceLogCommands(this, app.lang, app.audio)

    platform.onMessage((message) => this.onMessage(message))
    platform.onVoicePresence((change) => this.onVoicePresence(change))
    platform.onCommand((request) => this._command.handle(request))
    platform.onReady(() => this.start())
  }

  private async onMessage(message: MessageView) {
    const guild = message.scope
    const guildKey = guildKeyString(guild)
    const data = await this._serverConfig.get(guild)

    if (!data?.voiceMessageTTS.enabled) return

    this.enqueue(async () => {
      const voice = this._voice.getCurrentVoice(guild)
      if (voice?.channelId === message.channelId) {
        const isContinuous = this.continuousUser[guildKey]?.user === message.authorId && message.timestamp - this.continuousUser[guildKey]?.timestamp < 5 * 1000
        const text = parseMessage(this.textLogger, message, isContinuous, data.voiceMessageTTS.messageLang, this.lang)

        if (text === '') {
          this._logger.debug('Skipped empty message')
          return
        }

        this._logger.debug(`[User ${message.authorId}] to [Channel ${message.channelId}] ${isContinuous ? '(Continuous)' : ''}: ${text}`)

        const tts = data.voiceMessageTTS
        if (!this.audio.providerIds().includes(tts.provider)) {
          this._logger.error(`Guild ${guild.guildId} uses unknown TTS provider "${tts.provider}", set it again with /voice tts`)
          return
        }
        this.audio.speak(voice.playback, { provider: tts.provider, text, lang: tts.voiceLang, voice: tts.voiceName })
        this.continuousUser[guildKey] = {
          user: message.authorId,
          timestamp: message.timestamp
        }
      }
    })
  }

  private onVoicePresence(change: VoicePresenceChange) {
    const { member, guildName, left, entered } = change
    if (member.userId === this.platform.selfUserId()) {
      // The bot was moved: remember the new channel, as if it went to sleep there
      if (left && entered) {
        this._serverConfig.updateLastVoiceChannel(member.scope, entered.channelId)
        this._serverConfig.updateCurrentVoiceChannel(member.scope, '')
      }
      return
    }
    if (left && entered) this.onSwitch(member, guildName, entered, left)
    else if (entered) this.onJoin(member, guildName, entered)
    else if (left) this.onLeave(member, guildName, left)
  }

  private async onJoin(member: MemberView, guildName: string, newChannel: ChannelView) {
    const guildId = member.scope.guildId
    this.logger.debug(
      `Queue (${this.queueLength + 1}): User ${member.username} (${member.userId}) joined voice channel ${newChannel.name} (${newChannel.channelId}) in guild ${guildName} (${guildId})`
    )
    this.enqueue(async () => {
      this.logger.info(`User ${member.username} (${member.userId}) joined voice channel ${newChannel.name} (${newChannel.channelId}) in guild ${guildName} (${guildId})`)
      await this.publishVoiceEvent(member, undefined, newChannel, 'join', [{ channel: newChannel, type: 'join' }])
    })
  }

  private async onLeave(member: MemberView, guildName: string, oldChannel: ChannelView) {
    const guildId = member.scope.guildId
    this.logger.debug(
      `Queue (${this.queueLength + 1}): User ${member.username} (${member.userId}) left voice channel ${oldChannel.name} (${oldChannel.channelId}) in guild ${guildName} (${guildId})`
    )
    this.enqueue(async () => {
      this.logger.info(`User ${member.username} (${member.userId}) left voice channel ${oldChannel.name} (${oldChannel.channelId}) in guild ${guildName} (${guildId})`)
      await this.publishVoiceEvent(member, oldChannel, undefined, 'leave', [{ channel: oldChannel, type: 'left' }])
    })
  }

  private async onSwitch(member: MemberView, guildName: string, newChannel: ChannelView, oldChannel: ChannelView) {
    const guildId = member.scope.guildId
    this.logger.debug(
      `Queue (${this.queueLength + 1}): User ${member.username} (${member.userId}) switched voice channel from ${oldChannel.name} (${oldChannel.channelId}) to ${newChannel.name} (${newChannel.channelId}) in guild ${guildName} (${guildId})`
    )
    this.enqueue(async () => {
      this.logger.info(
        `User ${member.username} (${member.userId}) switched voice channel from ${oldChannel.name} (${oldChannel.channelId}) to ${newChannel.name} (${newChannel.channelId}) in guild ${guildName} (${guildId})`
      )
      await this.publishVoiceEvent(member, oldChannel, newChannel, 'move', [
        { channel: oldChannel, type: 'switched_out' },
        { channel: newChannel, type: 'switched_in' }
      ])
    })
  }

  private resetContinuousSpeaker(guild: GuildKey) {
    this.continuousUser[guildKeyString(guild)] = {
      user: this.platform.selfUserId(),
      timestamp: 0
    }
  }

  // Shared path of join, leave and switch. Each caller keeps its own log text and passes its event types.
  private async publishVoiceEvent(
    member: MemberView,
    oldChannel: ChannelView | undefined,
    newChannel: ChannelView | undefined,
    embedType: string,
    announcements: { channel: ChannelView; type: string }[]
  ) {
    const guild = member.scope
    const channelID = await this._voice.autoLeaveChannel(oldChannel, newChannel, guild)
    const voice = this._voice.getCurrentVoice(guild)
    const data = await this._serverConfig.get(guild)

    if (data) {
      if (data.channelID !== '') {
        // Not awaited, as before; a failure is logged by the platform
        this.platform.text.send({ scope: guild, channelId: data.channelID }, [genVoiceLogEmbed(this.lang, member, data.lang, embedType, oldChannel, newChannel)])
      }
    }
    for (const announcement of announcements) {
      if (announcement.channel.channelId === channelID) {
        if (voice) {
          this.audio.announceMember(voice.playback, member, announcement.type)
          this.resetContinuousSpeaker(guild)
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

  public get logger() {
    return this._logger
  }

  public get serverConfig() {
    return this._serverConfig
  }

  // On every ready of the platform. The cache jobs are scheduled once for all platforms, see App/Bot.ts.
  public async start() {
    const assetDir = memberAssetDir(this.platform.scope)
    if (!exists(assetDir)) mkDir(assetDir, { recursive: true })
    if (!this._voice.available) return
    const channels = await this._serverConfig.getCurrentChannels(this.platform.scope)
    channels.forEach((element: IServerConfig) => {
      this._logger.info(`Reconnecting to ${element.currentVoiceChannel}...`)
      this._voice.join({ ...this.platform.scope, guildId: element.serverID }, element.currentVoiceChannel)
    })
  }

  public async end() {
    await this.voice.end()
  }
}
