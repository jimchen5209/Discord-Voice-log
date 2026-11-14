import { Client, type Member, type VoiceChannel } from '@projectdysnomia/dysnomia'
import type { ILogObj, Logger } from 'tslog'
import type { Config } from '../Config'
import type { CommandRequest } from '../Platform/Command'
import type { PlatformRuntime } from '../Platform/Runtime'
import type { PlatformScope } from '../Platform/Scope'
import type { MessageView, VoicePresenceChange } from '../Platform/Views'
import type { Lang } from '../Shared/Lang'
import { Command } from './Command'
import { DISCORD_SCOPE, toChannelView, toMemberView, toMessageView } from './Mapping'
import { LogCommand } from './SlashCommands/Log'
import { RefreshCacheCommand } from './SlashCommands/RefreshCache'
import { VoiceCommand } from './SlashCommands/Voice'
import { DiscordTextOutput } from './TextOutput'
import { DiscordVoicePlayback } from './VoiceConnection'

export function assertDiscordToken(config: Config) {
  if (!config.platform.discord.botToken) throw Error('Discord token missing')
}

function presence(member: Member, left: VoiceChannel | undefined, entered: VoiceChannel | undefined): VoicePresenceChange {
  return {
    member: toMemberView(member),
    guildName: member.guild.name,
    left: left && toChannelView(left),
    entered: entered && toChannelView(entered)
  }
}

export class Discord implements PlatformRuntime {
  public readonly scope: PlatformScope = DISCORD_SCOPE
  private _client: Client
  private _command: Command
  private _logger: Logger<ILogObj>
  private _text: DiscordTextOutput
  private _voice: DiscordVoicePlayback

  // lang and ttsProviderIds fill the choices of the slash command options
  constructor(config: Config, mainLogger: Logger<ILogObj>, lang: Lang, ttsProviderIds: string[]) {
    this._logger = mainLogger.getSubLogger({ name: 'Discord' })
    this._client = new Client(config.platform.discord.botToken, {
      restMode: true,
      gateway: {
        intents: ['guilds', 'guildMessages', 'guildVoiceStates', 'messageContent']
      }
    })
    this._command = new Command(this, config)
    this._command.register(
      (creator) => new VoiceCommand(creator, this._command, lang, ttsProviderIds),
      (creator) => new LogCommand(creator, this._command, lang),
      (creator) => new RefreshCacheCommand(creator, this._command)
    )
    this._text = new DiscordTextOutput(this._client, this._logger)
    this._voice = new DiscordVoicePlayback(this)

    this._client.on('ready', async () => {
      this._logger.info(`Logged in as ${this._client.user.username} (${this._client.user.id})`)
      this._command.refreshCommands()
    })

    this._client.on('warn', (message) => {
      this._logger.warn(message)
    })

    this._client.on('error', (error) => {
      this._logger.error(error)
    })
  }

  public get client() {
    return this._client
  }

  public get logger() {
    return this._logger
  }

  public get text() {
    return this._text
  }

  public get voice() {
    return this._voice
  }

  public selfUserId() {
    return this._client.user.id
  }

  public onReady(handler: () => void) {
    this._client.on('ready', handler)
  }

  public onMessage(handler: (message: MessageView) => void) {
    this._client.on('messageCreate', (message) => {
      if (message.guildID === undefined) return
      handler(toMessageView(this._client, message))
    })
  }

  public onVoicePresence(handler: (change: VoicePresenceChange) => void) {
    this._client.on('voiceChannelJoin', (member: Member, newChannel: VoiceChannel) => handler(presence(member, undefined, newChannel)))
    this._client.on('voiceChannelLeave', (member: Member, oldChannel: VoiceChannel) => handler(presence(member, oldChannel, undefined)))
    this._client.on('voiceChannelSwitch', (member: Member, newChannel: VoiceChannel, oldChannel: VoiceChannel) => handler(presence(member, oldChannel, newChannel)))
  }

  public onCommand(handler: (request: CommandRequest) => Promise<void>) {
    this._command.setHandler(handler)
  }

  public async start() {
    await this._client.connect()
  }

  public async stop() {
    this._logger.info('Logging out...')
    await new Promise<void>((resolve) => {
      this._client.once('disconnect', resolve)
      this._client.disconnect({ reconnect: false })
    })
  }
}
