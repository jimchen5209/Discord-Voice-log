import { Client } from 'eris'
import { Logger } from 'tslog-helper'
import { AnyRequestData, GatewayServer, SlashCommand, SlashCreator } from 'slash-create'
import { Core } from '../../..'
import { Config } from '../../../Core/Config'
import { Lang } from '../../../Core/Lang'
import { Discord } from '../Core'
import { LogCommand } from './Commands/Log'
import { RefreshCacheCommand } from './Commands/RefreshCache'
import { VoiceCommand } from './Commands/Voice'
import { VoiceLog } from './VoiceLog'

export class Command {
  private config: Config
  private bot: Client
  private creator: SlashCreator
  private logger: Logger
  private voiceLog: VoiceLog
  private lang: Lang
  private registered = false

  constructor(voiceLog: VoiceLog, core: Core, discord: Discord, bot: Client) {
    this.config = core.config
    this.bot = bot
    this.logger = core.mainLogger.getChildLogger({ name: 'Command'})
    this.voiceLog = voiceLog
    this.lang = discord.lang

    this.creator = new SlashCreator({
      applicationID: this.config.discord.applicationID,
      publicKey: this.config.discord.publicKey,
      token: this.config.discord.botToken
    })

    this.creator
      .withServer(
        new GatewayServer(
          (handler) => this.bot.on('rawWS', event => {
            if (event.t === 'INTERACTION_CREATE') handler(event.d as AnyRequestData)
          })
        )
      )
  }

  public refreshCommands() {
    if (this.registered) return

    this.logger.info('Refreshing commands to all guilds...')

    this.bot.getRESTGuilds({ limit: 200 }).then(value => {
      const guildIDs: string[] = []

      value.forEach(value => { guildIDs.push(value.id) })

      const commands: SlashCommand[] = [
        new VoiceCommand(this.creator, guildIDs, this.voiceLog),
        new LogCommand(this.creator, guildIDs, this.lang, this.voiceLog),
        new RefreshCacheCommand(this.creator, guildIDs, this.voiceLog)
      ]

      this.creator.registerCommands(commands)
      this.registered = true
      this.creator.syncCommands()
    })
  }
}