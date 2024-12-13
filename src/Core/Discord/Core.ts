import { Client } from 'eris'
import { Command } from './Core/Command'
import { VoiceLog } from './VoiceLog/VoiceLog'
import { instances } from '../../Utils/Instances'

const ERR_MISSING_TOKEN = Error('Discord token missing')

const token = instances.config.discord.botToken
if (!token) throw ERR_MISSING_TOKEN

export class Discord {
  private _client: Client
  private _voiceLog: VoiceLog
  private command: Command
  private log = instances.mainLogger.getSubLogger({ name: 'Discord' })

  constructor() {
    this._client = new Client(token, {
      restMode: true,
      intents: [
        'guilds',
        'guildIntegrations',
        'guildMessages',
        'guildVoiceStates',
        'guildMembers'
      ]
    })
    this._voiceLog = new VoiceLog(this, this.log)
    this.command = new Command(this, this.log)

    process.on('warning', (e) => {
      this.log.warn(e.message)
    })

    this._client.on('ready', async () => {
      this.log.info(
        `Logged in as ${this._client.user.username} (${this._client.user.id})`
      )
      this.command.refreshCommands()
      this._voiceLog.start()
    })
  }

  public get client() {
    return this._client
  }

  public get voiceLog() {
    return this._voiceLog
  }

  public start() {
    this._client.connect()
  }

  public stop() {
    this.log.info('Logging out...')
    this._voiceLog.end().then(() => {
      this._client.disconnect({ reconnect: false })
    })
  }
}
