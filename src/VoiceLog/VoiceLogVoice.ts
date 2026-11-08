import waitUntil from 'async-wait-until'
import type { ILogObj, Logger } from 'tslog'
import type { Audio } from '../Audio/Audio'
import type { DbServerConfigManager } from '../Db/ServerConfig'
import { type GuildKey, guildKeyString } from '../Platform/Scope'
import type { ChannelView } from '../Platform/Views'
import type { VoicePlayback, VoiceSession } from '../Platform/VoicePlayback'
import type { VoiceLog } from './VoiceLog'

export class VoiceLogVoice {
  private playback: VoicePlayback
  // Keyed by guildKeyString, so the same guild id on two platforms never shares a connection
  private audios = new Map<string, { guild: GuildKey; voice: VoiceSession }>()
  private logger: Logger<ILogObj>
  private serverConfig: DbServerConfigManager
  private audio: Audio

  constructor(voiceLog: VoiceLog, playback: VoicePlayback, audio: Audio) {
    this.playback = playback
    this.logger = voiceLog.logger.getSubLogger({ name: 'Voice' })
    this.serverConfig = voiceLog.serverConfig
    this.audio = audio
  }

  private session(guild: GuildKey): VoiceSession | undefined {
    return this.audios.get(guildKeyString(guild))?.voice
  }

  public getCurrentVoice(guild: GuildKey): VoiceSession | undefined {
    const voice = this.session(guild)
    if (!voice) {
      const existing = this.playback.adoptExisting(guild)
      if (existing) this.audios.set(guildKeyString(guild), { guild, voice: existing })
      return existing
    }
    if (!voice.isReady()) {
      this.destroy(guild)
      return undefined
    }

    return voice
  }

  public async join(guild: GuildKey, channelId: string, updateDatabase = false, playJoin = false): Promise<VoiceSession | undefined> {
    const current = this.session(guild)
    if (current) {
      if (!current.isReady() && !current.init) {
        this.destroy(guild)
      } else if (current.channelId !== channelId) {
        current.switchChannel(channelId)

        if (updateDatabase) {
          this.serverConfig.updateLastVoiceChannel(guild, '')
          this.serverConfig.updateCurrentVoiceChannel(guild, channelId)
        }

        if (playJoin) this.audio.announceMoved(current.playback)
        return current
      } else {
        return current
      }
    }

    this.audios.set(guildKeyString(guild), { guild, voice: this.playback.connect(guild, channelId) })
    try {
      await waitUntil(() => this.session(guild)?.isReady())
    } catch (error) {
      this.logger.error('Voice timed out:', error)
      return
    }
    if (updateDatabase) {
      this.serverConfig.updateLastVoiceChannel(guild, '')
      this.serverConfig.updateCurrentVoiceChannel(guild, channelId)
    }

    // Destroyed while connecting
    const voice = this.session(guild)
    if (!voice) return
    if (playJoin) this.audio.announceReady(voice.playback)

    return voice
  }

  public async destroy(guild: GuildKey, updateDatabase = false) {
    this.session(guild)?.destroy()
    this.audios.delete(guildKeyString(guild))
    if (updateDatabase) {
      this.serverConfig.updateLastVoiceChannel(guild, '')
      this.serverConfig.updateCurrentVoiceChannel(guild, '')
    }
  }

  private async sleep(guild: GuildKey, channelId: string) {
    this.logger.info(`No user in ${channelId}, sleeping...`)
    this.destroy(guild)
    this.serverConfig.updateLastVoiceChannel(guild, channelId)
    this.serverConfig.updateCurrentVoiceChannel(guild, '')
  }

  public async end() {
    for (const { guild } of this.audios.values()) {
      this.destroy(guild)
    }
  }

  public async autoLeaveChannel(oldChannel: ChannelView | undefined, newChannel: ChannelView | undefined, guild: GuildKey): Promise<string | undefined> {
    let channelToCheck: ChannelView | undefined

    const voice = this.getCurrentVoice(guild)
    const data = await this.serverConfig.get(guild)

    if (voice?.isReady()) {
      channelToCheck = oldChannel?.channelId === voice?.channelId ? oldChannel : newChannel?.channelId === voice?.channelId ? newChannel : undefined
    } else if (data) {
      channelToCheck = oldChannel?.channelId === data.lastVoiceChannel ? oldChannel : newChannel?.channelId === data.lastVoiceChannel ? newChannel : undefined
    }

    if (!channelToCheck) return

    const humans = this.playback.humanCount(channelToCheck)
    // Unknown is not empty: never leave, or join, on a member list the bot cannot see
    if (humans === undefined) return

    if (humans === 0) {
      if (voice) {
        await this.sleep(guild, channelToCheck.channelId)
      }
    } else {
      let connection = await this.join(guild, channelToCheck.channelId, true)
      for (let i = 0; i < 5; ++i) {
        if (!connection) {
          this.logger.warn(`Auto reconnect failed, retrying (${i + 1} / 5)...`)
          await this.destroy(guild)
          connection = await this.join(guild, channelToCheck.channelId, true)
        } else {
          return channelToCheck.channelId
        }
      }

      this.logger.error('Auto reconnect fails after 5 tries')
    }
  }
}
