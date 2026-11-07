import type { VoiceChannel } from '@projectdysnomia/dysnomia'
import waitUntil from 'async-wait-until'
import type { ILogObj, Logger } from 'tslog'
import { instances } from '../App/App'
import type { DbServerConfigManager } from '../Db/ServerConfig'
import type { Discord } from '../Discord/Discord'
import { DiscordVoice } from '../Discord/VoiceConnection'
import type { VoiceLog } from './VoiceLog'

export class VoiceLogVoice {
  private discord: Discord
  private audios: { [key: string]: DiscordVoice } = {}
  private logger: Logger<ILogObj>
  private serverConfig: DbServerConfigManager

  constructor(voiceLog: VoiceLog, discord: Discord) {
    this.discord = discord
    this.logger = voiceLog.logger.getSubLogger({ name: 'Voice' })
    this.serverConfig = voiceLog.serverConfig
  }

  public getCurrentVoice(guildId: string): DiscordVoice | undefined {
    const voice = this.audios[guildId]
    if (!voice) {
      const botVoice = this.discord.client.voiceConnections.get(guildId)
      if (botVoice?.ready) {
        if (botVoice.channelID) this.audios[guildId] = new DiscordVoice(this.discord, botVoice.channelID, botVoice)
        return this.audios[guildId]
      }
      return undefined
    }
    if (!voice.isReady()) {
      this.destroy(guildId)
      return undefined
    }

    return this.audios[guildId]
  }

  public async join(guildId: string, channelId: string, updateDatabase = false, playJoin = false): Promise<DiscordVoice | undefined> {
    if (this.audios[guildId]) {
      if (!this.audios[guildId].isReady() && !this.audios[guildId].init) {
        this.destroy(guildId)
      } else if (this.audios[guildId].channelId !== channelId) {
        this.audios[guildId].switchChannel(channelId)

        if (updateDatabase) {
          this.serverConfig.updateLastVoiceChannel(guildId, '')
          this.serverConfig.updateCurrentVoiceChannel(guildId, channelId)
        }

        if (playJoin) instances.audio.announceMoved(this.audios[guildId].playback)
        return this.audios[guildId]
      } else {
        return this.audios[guildId]
      }
    }

    this.audios[guildId] = new DiscordVoice(this.discord, channelId)
    try {
      await waitUntil(() => this.audios[guildId]?.isReady())
    } catch (error) {
      this.logger.error('Voice timed out:', error)
      return
    }
    if (updateDatabase) {
      this.serverConfig.updateLastVoiceChannel(guildId, '')
      this.serverConfig.updateCurrentVoiceChannel(guildId, channelId)
    }

    if (playJoin) instances.audio.announceReady(this.audios[guildId].playback)

    return this.audios[guildId]
  }

  public async destroy(guildId: string, updateDatabase = false) {
    this.audios[guildId].destroy()
    delete this.audios[guildId]
    if (updateDatabase) {
      this.serverConfig.updateLastVoiceChannel(guildId, '')
      this.serverConfig.updateCurrentVoiceChannel(guildId, '')
    }
  }

  private async sleep(guildId: string, channelId: string) {
    this.logger.info(`No user in ${channelId}, sleeping...`)
    this.destroy(guildId)
    this.serverConfig.updateLastVoiceChannel(guildId, channelId)
    this.serverConfig.updateCurrentVoiceChannel(guildId, '')
  }

  public async end() {
    for (const guildId in this.audios) {
      this.destroy(guildId)
    }
  }

  public async autoLeaveChannel(oldChannel: VoiceChannel | undefined, newChannel: VoiceChannel | undefined, guildId: string): Promise<string | undefined> {
    let channelToCheck: VoiceChannel | undefined

    const voice = this.getCurrentVoice(guildId)
    const data = await this.serverConfig.get(guildId)

    if (voice?.isReady()) {
      channelToCheck = oldChannel?.id === voice?.channelId ? oldChannel : newChannel?.id === voice?.channelId ? newChannel : undefined
    } else if (data) {
      channelToCheck = oldChannel?.id === data.lastVoiceChannel ? oldChannel : newChannel?.id === data.lastVoiceChannel ? newChannel : undefined
    }

    if (!channelToCheck) return

    let noUser = true

    channelToCheck.voiceMembers?.forEach((user) => {
      if (!user.bot) {
        noUser = false
      }
    })

    if (noUser) {
      if (voice) {
        await this.sleep(guildId, channelToCheck.id)
      }
    } else {
      let connection = await this.join(guildId, channelToCheck.id, true)
      for (let i = 0; i < 5; ++i) {
        if (!connection) {
          this.logger.warn(`Auto reconnect failed, retrying (${i + 1} / 5)...`)
          await this.destroy(guildId)
          connection = await this.join(guildId, channelToCheck.id, true)
        } else {
          return channelToCheck.id
        }
      }

      this.logger.error('Auto reconnect fails after 5 tries')
    }
  }
}
