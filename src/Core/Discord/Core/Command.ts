import { Client } from 'eris'
import { ILogObj, Logger } from 'tslog'
import { AnyRequestData, GatewayServer, SlashCommand, SlashCreator } from 'slash-create'
import { Config } from '../../Config'
import { Lang } from '../../Lang'
import { Discord } from '../Core'
import { LogCommand } from './Commands/Log'
import { RefreshCacheCommand } from './Commands/RefreshCache'
import { VoiceCommand } from './Commands/Voice'
import { VoiceLog } from '../VoiceLog/VoiceLog'
import { instances } from '../../../Utils/Instances'

export class Command {
  private config: Config
  private client: Client
  private creator: SlashCreator
  private logger: Logger<ILogObj>
  private voiceLog: VoiceLog
  private lang: Lang
  private registered = false

  constructor(discord: Discord, logger: Logger<ILogObj>) {
    this.config = instances.config
    this.client = discord.client
    this.logger = logger.getSubLogger({ name: 'Command' })
    this.voiceLog = discord.voiceLog
    this.lang = instances.lang

    this.creator = new SlashCreator({
      applicationID: this.config.discord.applicationID,
      publicKey: this.config.discord.publicKey,
      token: this.config.discord.botToken
    })

    this.creator.withServer(
      new GatewayServer((handler) =>
        this.client.on('rawWS', (event) => {
          if (event.t === 'INTERACTION_CREATE')
            handler(event.d as AnyRequestData)
        })
      )
    )
  }

  public refreshCommands() {
    if (this.registered) return

    this.logger.info('Refreshing commands to all guilds...')

    this.client.getRESTGuilds({ limit: 200 }).then((value) => {
      const guildIDs: string[] = []

      value.forEach((value) => {
        guildIDs.push(value.id)
      })

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
