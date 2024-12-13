import { Client, Member, VoiceChannel } from 'eris'
import fs from 'fs'
import { ILogObj, Logger } from 'tslog'
import { scheduleJob } from 'node-schedule'
import Queue from 'promise-queue'
import { DbServerConfigManager } from '../../MongoDB/db/ServerConfig'
import { Discord } from '../Core'
import { VoiceLogCommands } from './VoiceLog/Commands'
import { VoiceLogText } from './VoiceLog/Text'
import { VoiceLogVoice } from './VoiceLog/Voice'
import { instances } from '../../../Utils/Instances'
import { ERR_DB_NOT_INIT } from '../../MongoDB/Core'

export class VoiceLog {
  private client: Client
  private _voice: VoiceLogVoice
  private _text: VoiceLogText
  private _command: VoiceLogCommands
  private queue: Queue = new Queue(1, Infinity)
  private logger: Logger<ILogObj>
  private _serverConfig: DbServerConfigManager

  constructor(discord: Discord, logger: Logger<ILogObj>) {
    this.client = discord.client
    this.logger = logger.getSubLogger({ name: 'VoiceLog' })

    const serverConfig = instances.mongoDB?.serverConfig
    if (!serverConfig) throw ERR_DB_NOT_INIT
    this._serverConfig = serverConfig

    this._voice = new VoiceLogVoice(this, discord, this.logger)
    this._text = new VoiceLogText(this, discord, this.logger)
    this._command = new VoiceLogCommands(this, discord, this.logger)

    this.client.on('voiceChannelJoin', async (member: Member, newChannel: VoiceChannel) => {
      this.queue.add(async () => {
        if (member.id === this.client.user.id) return
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
          if (voice) voice.playVoice(member, 'join')
        }
      })
    })

    this.client.on('voiceChannelLeave', async (member: Member, oldChannel: VoiceChannel) => {
      this.queue.add(async () => {
        if (member.id === this.client.user.id) return
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
          if (voice) voice.playVoice(member, 'left')
        }
      })
    })

    this.client.on('voiceChannelSwitch', async (member: Member, newChannel: VoiceChannel, oldChannel: VoiceChannel) => {
      this.queue.add(async () => {
        if (member.id === this.client.user.id) {
          this._serverConfig.updateLastVoiceChannel(member.guild.id, newChannel.id)
          this._serverConfig.updateCurrentVoiceChannel(member.guild.id, '')
          return
        }
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
          if (voice) voice.playVoice(member, 'switched_out')
        }
        if (newChannel.id === channelID) {
          if (voice) voice.playVoice(member, 'switched_in')
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

  public get serverConfig() {
    return this._serverConfig
  }

  public async start() {
    if (!fs.existsSync('./assets')) fs.mkdirSync('./assets')
    if (!fs.existsSync('./caches')) fs.mkdirSync('./caches')
    const channels = await this._serverConfig.getCurrentChannels()
    channels.forEach(element => {
      this.logger.info(`Reconnecting to ${element.currentVoiceChannel}...`)
      this._voice.join(element.serverID, element.currentVoiceChannel)
    })
    scheduleJob('0 0 * * *', () => { this._voice.refreshCache(undefined) })
  }

  public async end() {
    await this.voice.end()
  }
}
