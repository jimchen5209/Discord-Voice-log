import type { Client } from '@projectdysnomia/dysnomia'
import { type AnyRequestData, GatewayServer, type SlashCommand, SlashCreator } from 'slash-create'
import type { ILogObj, Logger } from 'tslog'
import type { Config } from '../Shared/Config'
import type { Discord } from './Discord'

export class Command {
  private client: Client
  private creator: SlashCreator
  private logger: Logger<ILogObj>
  private registered = false
  private factories: ((creator: SlashCreator) => SlashCommand)[] = []

  constructor(discord: Discord, config: Config) {
    this.client = discord.client
    this.logger = discord.logger.getSubLogger({ name: 'Command' })

    this.creator = new SlashCreator({
      client: {
        discord: this.client
      },
      applicationID: config.discord.applicationID,
      publicKey: config.discord.publicKey,
      token: config.discord.botToken
    })

    this.creator.withServer(
      new GatewayServer((handler) =>
        this.client.on('rawWS', (event) => {
          if (event.t === 'INTERACTION_CREATE') handler(event.d as AnyRequestData)
        })
      )
    )
  }

  public register(...factories: ((creator: SlashCreator) => SlashCommand)[]) {
    if (this.registered) throw new Error('Command.register() called after commands were refreshed')
    this.factories.push(...factories)
  }

  public refreshCommands() {
    if (this.registered) return

    this.logger.info('Refreshing commands to all guilds...')

    this.client.getRESTGuilds({ limit: 200 }).then((value) => {
      this.creator.client.guildIDs = value.map((value) => value.id)

      const commands = this.factories.map((factory) => factory(this.creator))

      this.creator.registerCommands(commands)
      this.registered = true
      this.creator.syncCommands()
    })
  }
}
