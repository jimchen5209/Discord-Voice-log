import type { Client } from '@projectdysnomia/dysnomia'
import { type AnyRequestData, type CommandContext, GatewayServer, type SlashCommand, SlashCreator } from 'slash-create'
import type { ILogObj, Logger } from 'tslog'
import type { CommandName, CommandReply, CommandRequest } from '../Platform/Command'
import type { Config } from '../Shared/Config'
import type { Discord } from './Discord'
import { discordGuild, toDiscordEmbed, toMemberView } from './Mapping'

function toReply(context: CommandContext): CommandReply {
  return {
    async send(embeds, options) {
      const discordEmbeds = embeds.map(toDiscordEmbed)
      await context.send(options?.private ? { embeds: discordEmbeds, ephemeral: true } : { embeds: discordEmbeds })
      return {
        async edit(edited) {
          // Edits the first reply, as every reply that gets edited is the first one
          await context.editOriginal({ embeds: edited.map(toDiscordEmbed) })
        }
      }
    }
  }
}

export class Command {
  private client: Client
  private config: Config
  private creator: SlashCreator
  private logger: Logger<ILogObj>
  private registered = false
  private factories: ((creator: SlashCreator) => SlashCommand)[] = []
  private handler: ((request: CommandRequest) => Promise<void>) | undefined

  constructor(discord: Discord, config: Config) {
    this.client = discord.client
    this.config = config
    this.logger = discord.logger.getSubLogger({ name: 'Command' })

    this.creator = new SlashCreator({
      client: {
        discord: this.client
      },
      applicationID: config.platform.discord.applicationID,
      publicKey: config.platform.discord.publicKey,
      token: config.platform.discord.botToken
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

  public setHandler(handler: (request: CommandRequest) => Promise<void>) {
    this.handler = handler
  }

  // Called by the slash commands. Commands outside a guild, or from a member that cannot be fetched, are ignored.
  public async dispatch(name: CommandName, context: CommandContext, options?: Record<string, unknown>) {
    if (!this.handler) {
      this.logger.warn(`No handler for /${name}, ignored`)
      return
    }
    if (!context.guildID || !context.member) return
    const member = await this.client.getRESTGuildMember(context.guildID, context.member.id)
    if (!member) return

    const botAdmin = this.config.platform.discord.admins.includes(member.id)
    const request: CommandRequest = {
      name,
      options,
      guild: discordGuild(member.guild.id),
      operator: toMemberView(member),
      channelId: context.channelID,
      operatorVoiceChannels: () => (member.voiceState.channelID ? [member.voiceState.channelID] : []),
      // Guild-level permission, without channel overwrites
      access: { manageMessages: member.permissions.has('manageMessages'), botAdmin },
      reply: toReply(context)
    }
    await this.handler(request)
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
