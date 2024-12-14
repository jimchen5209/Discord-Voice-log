import { Client } from 'eris'
import { ILogObj, Logger } from 'tslog'
import { AnyRequestData, GatewayServer, SlashCommand, SlashCreator } from 'slash-create'
import { Config } from '../../../Utils/Config'
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
  private registered = false

  constructor(discord: Discord) {
    this.config = instances.config
    this.client = discord.client
    this.logger = discord.logger.getSubLogger({ name: 'Command' })
    this.voiceLog = discord.voiceLog

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
      const guildIDs = value.map((value) => value.id)

      this.creator.client = {
        guildIDs,
        voiceLog: this.voiceLog,
        discord: this.client
      }

      const commands: SlashCommand[] = [
        new VoiceCommand(this.creator),
        new LogCommand(this.creator),
        new RefreshCacheCommand(this.creator)
      ]

      this.creator.registerCommands(commands)
      this.registered = true
      this.creator.syncCommands()
    })
  }
}
