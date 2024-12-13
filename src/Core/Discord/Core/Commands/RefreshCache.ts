import { CommandContext, SlashCommand, SlashCreator } from 'slash-create'
import { VoiceLog } from '../../VoiceLog/VoiceLog'

export class RefreshCacheCommand extends SlashCommand {
  private voiceLog: VoiceLog
  constructor(creator: SlashCreator, guildIDs: string[], voiceLog: VoiceLog) {
    super(creator, {
      name: 'refresh_cache',
      description: 'Download and cache all tts file (bot operator)',
      guildIDs
    })
    this.voiceLog = voiceLog
  }

  async run(ctx: CommandContext) {
    this.voiceLog.command.commandRefreshCache(ctx)
  }
}
