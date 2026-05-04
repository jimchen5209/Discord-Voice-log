import type { Client } from '@projectdysnomia/dysnomia'
import { type AnyRequestData, GatewayServer, type SlashCommand, SlashCreator } from 'slash-create'
import type { ILogObj, Logger } from 'tslog'
import { instances } from '../../../Utils/Instances'
import type { Discord } from '../Core'
import { LogCommand } from './Commands/Log'
import { RefreshCacheCommand } from './Commands/RefreshCache'
import { VoiceCommand } from './Commands/Voice'

export class Command {
  private client: Client
  private creator: SlashCreator
  private logger: Logger<ILogObj>
  private registered = false

  constructor(discord: Discord) {
    this.client = discord.client
    this.logger = discord.logger.getSubLogger({ name: 'Command' })

    this.creator = new SlashCreator({
      client: {
        voiceLog: discord.voiceLog,
        discord: this.client
      },
      applicationID: instances.config.discord.applicationID,
      publicKey: instances.config.discord.publicKey,
      token: instances.config.discord.botToken
    })

    this.creator.withServer(
      new GatewayServer((handler) =>
        this.client.on('rawWS', (event) => {
          if (event.t === 'INTERACTION_CREATE') handler(event.d as AnyRequestData)
        })
      )
    )
  }

  public refreshCommands() {
    if (this.registered) return

    this.logger.info('Refreshing commands to all guilds...')

    this.client.getRESTGuilds({ limit: 200 }).then((value) => {
      this.creator.client.guildIDs = value.map((value) => value.id)

      const commands: SlashCommand[] = [new VoiceCommand(this.creator), new LogCommand(this.creator), new RefreshCacheCommand(this.creator)]

      this.creator.registerCommands(commands)
      this.registered = true
      this.creator.syncCommands()
    })
  }
}
