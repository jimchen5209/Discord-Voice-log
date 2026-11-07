import { Client } from '@projectdysnomia/dysnomia'
import type { ILogObj, Logger } from 'tslog'
import type { Config } from '../Shared/Config'
import { Command } from './Command'

export function assertDiscordToken(config: Config) {
  if (!config.discord.botToken) throw Error('Discord token missing')
}

export class Discord {
  private _client: Client
  private _command: Command
  private _logger: Logger<ILogObj>

  constructor(config: Config, mainLogger: Logger<ILogObj>) {
    this._logger = mainLogger.getSubLogger({ name: 'Discord' })
    this._client = new Client(config.discord.botToken, {
      restMode: true,
      gateway: {
        intents: ['guilds', 'guildMessages', 'guildVoiceStates', 'messageContent']
      }
    })
    this._command = new Command(this, config)

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

  public get command() {
    return this._command
  }

  public start() {
    this._client.connect()
  }

  public async stop() {
    this._logger.info('Logging out...')
    await new Promise<void>((resolve) => {
      this._client.once('disconnect', resolve)
      this._client.disconnect({ reconnect: false })
    })
  }
}
