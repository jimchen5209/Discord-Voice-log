import type { Client } from '@projectdysnomia/dysnomia'
import type { CommandContext } from 'slash-create'
import type { ILogObj, Logger } from 'tslog'
import type { Audio } from '../../Audio/Audio'
import type { DbServerConfigManager } from '../../Db/ServerConfig'
import type { Discord } from '../../Discord/Discord'
import type { Config } from '../../Shared/Config'
import type { Lang } from '../../Shared/Lang'
import type { VoiceLog } from '../VoiceLog'
import type { CommandDeps } from './Guard'
import { commandJoin } from './Join'
import { commandLang } from './Lang'
import { commandLeave } from './Leave'
import { commandRefreshCache } from './RefreshCache'
import { commandSetTTS } from './SetTts'
import { commandSetVoiceLog } from './SetVoiceLog'
import { commandUnsetVoiceLog } from './UnsetVoiceLog'

export class VoiceLogCommands {
  private client: Client
  private voiceLog: VoiceLog
  private logger: Logger<ILogObj>
  private serverConfig: DbServerConfigManager
  private config: Config
  private lang: Lang
  private audio: Audio

  constructor(voiceLog: VoiceLog, discord: Discord, config: Config, lang: Lang, audio: Audio) {
    this.client = discord.client
    this.voiceLog = voiceLog
    this.serverConfig = voiceLog.serverConfig
    this.logger = voiceLog.logger.getSubLogger({ name: 'command' })
    this.config = config
    this.lang = lang
    this.audio = audio
  }

  private deps(): CommandDeps {
    return {
      client: this.client,
      voiceLog: this.voiceLog,
      logger: this.logger,
      serverConfig: this.serverConfig,
      config: this.config,
      lang: this.lang,
      audio: this.audio
    }
  }

  public commandJoin(context: CommandContext) {
    return commandJoin(this.deps(), context)
  }

  public commandLeave(context: CommandContext) {
    return commandLeave(this.deps(), context)
  }

  public commandSetVoiceLog(context: CommandContext) {
    return commandSetVoiceLog(this.deps(), context)
  }

  public commandLang(context: CommandContext) {
    return commandLang(this.deps(), context)
  }

  public commandUnsetVoiceLog(context: CommandContext) {
    return commandUnsetVoiceLog(this.deps(), context)
  }

  public commandSetTTS(context: CommandContext) {
    return commandSetTTS(this.deps(), context)
  }

  public commandRefreshCache(context: CommandContext) {
    return commandRefreshCache(this.deps(), context)
  }
}
