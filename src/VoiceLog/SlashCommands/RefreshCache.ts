import { type CommandContext, SlashCommand, type SlashCreator } from 'slash-create'
import type { VoiceLog } from '../VoiceLog'

export class RefreshCacheCommand extends SlashCommand {
  private voiceLog: VoiceLog

  constructor(creator: SlashCreator, voiceLog: VoiceLog) {
    super(creator, {
      name: 'refresh_cache',
      description: 'Download and cache all tts file (bot operator)',
      guildIDs: creator.client.guildIDs
    })
    this.voiceLog = voiceLog
  }

  async run(ctx: CommandContext) {
    this.voiceLog.command.commandRefreshCache(ctx)
  }
}
