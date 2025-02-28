import { Client, Member, VoiceChannel } from 'eris'
import { existsSync as exists, mkdirSync as mkDir } from 'fs'
import { ILogObj, Logger } from 'tslog'
import { scheduleJob } from 'node-schedule'
import Queue from 'promise-queue'
import { DbServerConfigManager, VoiceMessageTTSType } from '../../MongoDB/db/ServerConfig'
import { Discord } from '../Core'
import { VoiceLogCommands } from './VoiceLog/Commands'
import { VoiceLogText } from './VoiceLog/Text'
import { VoiceLogVoice } from './VoiceLog/Voice'
import { instances } from '../../../Utils/Instances'
import { ERR_DB_NOT_INIT } from '../../MongoDB/Core'

export class VoiceLog {
  private _voice: VoiceLogVoice
  private _text: VoiceLogText
  private _command: VoiceLogCommands
  private _logger: Logger<ILogObj>
  private _serverConfig: DbServerConfigManager
  private client: Client
  private queue: Queue = new Queue(1, Infinity)
  private continuousUser: { [key: string]: { user: string, timestamp: number} } = {}

  constructor(discord: Discord) {
    this.client = discord.client
    this._logger = discord.logger.getSubLogger({ name: 'VoiceLog' })

    const serverConfig = instances.mongoDB?.serverConfig
    if (!serverConfig) throw ERR_DB_NOT_INIT
    this._serverConfig = serverConfig

    this._voice = new VoiceLogVoice(this, discord)
    this._text = new VoiceLogText(this, discord)
    this._command = new VoiceLogCommands(this, discord)


    this.client.on('messageCreate', async (message) => {
      if (message.guildID === undefined) return
      const guildId = message.guildID
      const data = await this._serverConfig.get(guildId)

      if (!data?.voiceMessageTTS.enabled) return

      this.queue.add(async () => {
        const voice = this._voice.getCurrentVoice(guildId)
        if (voice?.channelId === message.channel.id) {
          const isContinuous = this.continuousUser[guildId]?.user === message.author.id && (message.timestamp - this.continuousUser[guildId]?.timestamp) < 5* 1000
          const text = this._text.parseMessage(message, isContinuous, data.lang)

          this._logger.debug(`${message.author} to ${message.channel} ${(isContinuous ? '(Continuous)' : '')}: ${text}`)

          voice.playTTS(
            text,
            data.voiceMessageTTS.type === VoiceMessageTTSType.waveNet,
            data.voiceMessageTTS.voiceLang,
            data.voiceMessageTTS.voiceName
          )
          this.continuousUser[guildId] = {
            user: message.author.id,
            timestamp: message.timestamp
          }
        }

      })
    })

    this.client.on('voiceChannelJoin', async (member: Member, newChannel: VoiceChannel) => {
      if (member.id === this.client.user.id) return
      this.logger.debug(`Queue (${this.queue.getQueueLength() + 1}): User ${member.username} (${member.id}) joined voice channel ${newChannel.name} (${newChannel.id}) in guild ${member.guild.name} (${member.guild.id})`)
      this.queue.add(async () => {
        this.logger.info(`User ${member.username} (${member.id}) joined voice channel ${newChannel.name} (${newChannel.id}) in guild ${member.guild.name} (${member.guild.id})`)

        const guildId = member.guild.id
        const channelID = await this._voice.autoLeaveChannel(undefined, newChannel, guildId)
        const voice = this._voice.getCurrentVoice(guildId)
        const data = await this._serverConfig.get(guildId)

        if (data) {
          if (data.channelID !== '') {
            this.client.createMessage(data.channelID, this._text.genVoiceLogEmbed(member, data.lang, 'join', undefined, newChannel))
          }
        }

        if (newChannel.id === channelID) {
          if (voice) {
            voice.playVoice(member, 'join')
            this.continuousUser[guildId] = {
              user: this.client.user.id,
              timestamp: 0
            }
          }
        }
      })
    })

    this.client.on('voiceChannelLeave', async (member: Member, oldChannel: VoiceChannel) => {
      if (member.id === this.client.user.id) return
      this.logger.debug(`Queue (${this.queue.getQueueLength() + 1}): User ${member.username} (${member.id}) left voice channel ${oldChannel.name} (${oldChannel.id}) in guild ${member.guild.name} (${member.guild.id})`)
      this.queue.add(async () => {
        this.logger.info(`User ${member.username} (${member.id}) left voice channel ${oldChannel.name} (${oldChannel.id}) in guild ${member.guild.name} (${member.guild.id})`)

        const guildId = member.guild.id
        const channelID = await this._voice.autoLeaveChannel(oldChannel, undefined, guildId)
        const voice = this._voice.getCurrentVoice(guildId)
        const data = await this._serverConfig.get(guildId)
        if (data) {
          if (data.channelID !== '') {
            this.client.createMessage(data.channelID, this._text.genVoiceLogEmbed(member, data.lang, 'leave', oldChannel, undefined))
          }
        }
        if (oldChannel.id === channelID) {
          if (voice) {
            voice.playVoice(member, 'left')
            this.continuousUser[guildId] = {
              user: this.client.user.id,
              timestamp: 0
            }
          }
        }
      })
    })

    this.client.on('voiceChannelSwitch', async (member: Member, newChannel: VoiceChannel, oldChannel: VoiceChannel) => {
      if (member.id === this.client.user.id) {
        this._serverConfig.updateLastVoiceChannel(member.guild.id, newChannel.id)
        this._serverConfig.updateCurrentVoiceChannel(member.guild.id, '')
        return
      }
      this.logger.debug(`Queue (${this.queue.getQueueLength() + 1}): User ${member.username} (${member.id}) switched voice channel from ${oldChannel.name} (${oldChannel.id}) to ${newChannel.name} (${newChannel.id}) in guild ${member.guild.name} (${member.guild.id})`)
      this.queue.add(async () => {
        this.logger.info(`User ${member.username} (${member.id}) switched voice channel from ${oldChannel.name} (${oldChannel.id}) to ${newChannel.name} (${newChannel.id}) in guild ${member.guild.name} (${member.guild.id})`)

        const guildId = member.guild.id
        const channelID = await this._voice.autoLeaveChannel(oldChannel, newChannel, guildId)
        const voice = this._voice.getCurrentVoice(guildId)
        const data = await this._serverConfig.get(guildId)

        if (data) {
          if (data.channelID !== '') {
            this.client.createMessage(data.channelID, this._text.genVoiceLogEmbed(member, data.lang, 'move', oldChannel, newChannel))
          }
        }
        if (oldChannel.id === channelID) {
          if (voice) {
            voice.playVoice(member, 'switched_out')
            this.continuousUser[guildId] = {
              user: this.client.user.id,
              timestamp: 0
            }
          }
        }
        if (newChannel.id === channelID) {
          if (voice) {
            voice.playVoice(member, 'switched_in')
            this.continuousUser[guildId] = {
              user: this.client.user.id,
              timestamp: 0
            }
          }
        }
      })
    })
  }

  public get voice() {
    return this._voice
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
    const channels = await this._serverConfig.getCurrentChannels()
    channels.forEach(element => {
      this._logger.info(`Reconnecting to ${element.currentVoiceChannel}...`)
      this._voice.join(element.serverID, element.currentVoiceChannel)
    })
    scheduleJob('0 0 * * *', () => { this._voice.refreshCache(undefined) })
  }

  public async end() {
    await this.voice.end()
  }
}
