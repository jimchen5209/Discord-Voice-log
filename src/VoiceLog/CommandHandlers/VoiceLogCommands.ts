import type { ILogObj, Logger } from 'tslog'
import type { Audio } from '../../Audio/Audio'
import type { DbServerConfigManager } from '../../Db/ServerConfig'
import type { CommandRequest } from '../../Platform/Command'
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
  private voiceLog: VoiceLog
  private logger: Logger<ILogObj>
  private serverConfig: DbServerConfigManager
  private lang: Lang
  private audio: Audio

  constructor(voiceLog: VoiceLog, lang: Lang, audio: Audio) {
    this.voiceLog = voiceLog
    this.serverConfig = voiceLog.serverConfig
    this.logger = voiceLog.logger.getSubLogger({ name: 'command' })
    this.lang = lang
    this.audio = audio
  }

  private deps(): CommandDeps {
    return {
      voiceLog: this.voiceLog,
      logger: this.logger,
      serverConfig: this.serverConfig,
      lang: this.lang,
      audio: this.audio
    }
  }

  public handle(request: CommandRequest): Promise<void> {
    switch (request.name) {
      case 'voice.join':
        return commandJoin(this.deps(), request)
      case 'voice.leave':
        return commandLeave(this.deps(), request)
      case 'voice.tts':
        return commandSetTTS(this.deps(), request)
      case 'log.set':
        return commandSetVoiceLog(this.deps(), request)
      case 'log.unset':
        return commandUnsetVoiceLog(this.deps(), request)
      case 'log.language':
        return commandLang(this.deps(), request)
      case 'refresh_cache':
        return commandRefreshCache(this.deps(), request)
    }
  }
}
