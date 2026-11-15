import waitUntil from 'async-wait-until'
import type { ILogObj, Logger } from 'tslog'
import type { Audio } from '../Audio/Audio'
import type { DbServerConfigManager } from '../Db/ServerConfig'
import { type GuildKey, guildKeyString } from '../Platform/Scope'
import type { ChannelView } from '../Platform/Views'
import type { VoicePlayback, VoiceSession } from '../Platform/VoicePlayback'
import type { VoiceLog } from './VoiceLog'

export class VoiceLogVoice {
  // Read when used: a platform knows whether it can play voice only once it has started.
  // Undefined when it cannot: nothing joins, and nothing is ever connected
  private voicePlayback: () => VoicePlayback | undefined
  // Keyed by guildKeyString, so the same guild id on two platforms never shares a connection. Sessions are found by
  // their current channel, not keyed by it: the platform may move one (e.g. a moderator drags the bot)
  private audios = new Map<string, { guild: GuildKey; voices: Set<VoiceSession> }>()
  private logger: Logger<ILogObj>
  private serverConfig: DbServerConfigManager
  private audio: Audio

  constructor(voiceLog: VoiceLog, playback: () => VoicePlayback | undefined, audio: Audio) {
    this.voicePlayback = playback
    this.logger = voiceLog.logger.getSubLogger({ name: 'Voice' })
    this.serverConfig = voiceLog.serverConfig
    this.audio = audio
  }

  public get available() {
    return this.playback !== undefined
  }

  private get playback() {
    return this.voicePlayback()
  }

  private entry(guild: GuildKey) {
    const key = guildKeyString(guild)
    let entry = this.audios.get(key)
    if (!entry) {
      entry = { guild, voices: new Set() }
      this.audios.set(key, entry)
    }
    return entry
  }

  // Sessions of the guild, connecting ones included; ended ones are dropped
  private sessionsOf(guild: GuildKey): VoiceSession[] {
    const playback = this.playback
    if (!playback) return []
    const entry = this.entry(guild)
    for (const voice of [...entry.voices]) {
      if (!voice.isReady() && !voice.init) {
        voice.destroy()
        entry.voices.delete(voice)
      }
    }
    if (entry.voices.size === 0) {
      const existing = playback.adoptExisting(guild)
      if (existing) entry.voices.add(existing)
    }
    return [...entry.voices]
  }

  // Ready sessions of the guild
  public voices(guild: GuildKey): VoiceSession[] {
    return this.sessionsOf(guild).filter((voice) => voice.isReady())
  }

  public voiceIn(guild: GuildKey, channelId: string): VoiceSession | undefined {
    return this.voices(guild).find((voice) => voice.channelId === channelId)
  }

  private async saveJoined(guild: GuildKey, channelId: string) {
    await this.serverConfig.setVoiceChannel(guild, channelId, true)
    if (!this.playback?.multiChannel) await this.serverConfig.removeVoiceChannel(guild, { not: channelId })
  }

  // Joins the channel; a platform with one session per guild moves that session there instead
  public async join(guild: GuildKey, channelId: string, updateDatabase = false, playJoin = false): Promise<VoiceSession | undefined> {
    const playback = this.playback
    if (!playback) return
    const sessions = this.sessionsOf(guild)
    const current = playback.multiChannel ? sessions.find((voice) => voice.channelId === channelId) : sessions[0]
    if (current) {
      if (current.channelId !== channelId) {
        current.switchChannel(channelId)
        if (updateDatabase) await this.saveJoined(guild, channelId)
        if (playJoin) this.audio.announceMoved(current.playback)
      }
      return current
    }

    const voice = playback.connect(guild, channelId)
    const entry = this.entry(guild)
    entry.voices.add(voice)
    try {
      await waitUntil(() => voice.isReady() || !entry.voices.has(voice))
    } catch (error) {
      this.logger.error('Voice timed out:', error)
      return
    }
    // Destroyed while connecting
    if (!entry.voices.has(voice)) return
    if (updateDatabase) await this.saveJoined(guild, channelId)
    if (playJoin) this.audio.announceReady(voice.playback)

    return voice
  }

  // Without a channel, every session of the guild
  public async destroy(guild: GuildKey, channelId?: string, updateDatabase = false) {
    const entry = this.audios.get(guildKeyString(guild))
    for (const voice of [...(entry?.voices ?? [])]) {
      if (channelId !== undefined && voice.channelId !== channelId) continue
      voice.destroy()
      entry?.voices.delete(voice)
    }
    if (updateDatabase) await this.serverConfig.removeVoiceChannel(guild, channelId)
  }

  private async sleep(guild: GuildKey, channelId: string) {
    this.logger.info(`No user in ${channelId}, sleeping...`)
    await this.destroy(guild, channelId)
    await this.serverConfig.setVoiceChannel(guild, channelId, false)
  }

  public async end() {
    for (const { guild } of this.audios.values()) {
      await this.destroy(guild)
    }
  }

  // Sleeps in, or wakes up in, the channels of a presence change the bot is in or asleep in.
  // Returns the channels of the change the bot is in afterwards.
  public async autoLeaveChannel(oldChannel: ChannelView | undefined, newChannel: ChannelView | undefined, guild: GuildKey): Promise<string[]> {
    const playback = this.playback
    if (!playback) return []
    const voices = this.voices(guild)
    // A connection that ended on its own (e.g. Fluxer reconnect failed) leaves only its saved channel
    const saved = await this.serverConfig.getVoiceChannels(guild)
    const channels = [oldChannel, newChannel].filter(
      (channel, index): channel is ChannelView => channel !== undefined && (index === 0 || channel.channelId !== oldChannel?.channelId)
    )
    const present: string[] = []

    for (const channel of channels) {
      const voice = voices.find((session) => session.channelId === channel.channelId)
      if (!voice && !saved.includes(channel.channelId)) continue

      const humans = playback.humanCount(channel)
      // Unknown is not empty: never leave, or join, on a member list the bot cannot see
      if (humans === undefined) {
        this.logger.debug(`Member list of ${channel.channelId} is unknown, not joining or leaving`)
        continue
      }

      if (humans === 0) {
        if (voice) await this.sleep(guild, channel.channelId)
        continue
      }

      let connection = await this.join(guild, channel.channelId, true)
      for (let i = 0; i < 5 && !connection; ++i) {
        this.logger.warn(`Auto reconnect failed, retrying (${i + 1} / 5)...`)
        await this.destroy(guild, channel.channelId)
        connection = await this.join(guild, channel.channelId, true)
      }
      if (connection) present.push(channel.channelId)
      else this.logger.error('Auto reconnect fails after 5 tries')
    }
    return present
  }
}
