import { CommandContext, SlashCommand, SlashCreator } from 'slash-create'
import { VoiceLog } from '../../VoiceLog/VoiceLog'

export class RefreshCacheCommand extends SlashCommand {
  private voiceLog: VoiceLog
  constructor(creator: SlashCreator) {
    super(creator, {
      name: 'refresh_cache',
      description: 'Download and cache all tts file (bot operator)',
      guildIDs: creator.client.guildIDs
    })
    this.voiceLog = creator.client.voiceLog
  }

  async run(ctx: CommandContext) {
    this.voiceLog.command.commandRefreshCache(ctx)
  }
}
