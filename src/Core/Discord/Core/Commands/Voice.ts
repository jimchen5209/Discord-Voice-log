import { type CommandContext, CommandOptionType, SlashCommand, type SlashCreator } from 'slash-create'
import type { VoiceLog } from '../../VoiceLog/VoiceLog'

export class VoiceCommand extends SlashCommand {
  private voiceLog: VoiceLog

  constructor(creator: SlashCreator) {
    super(creator, {
      name: 'voice',
      description: 'VoiceLog voice option',
      guildIDs: creator.client.guildIDs,
      options: [
        {
          name: 'join',
          description: 'Make bot join your channel (admin)',
          type: CommandOptionType.SUB_COMMAND
        },
        {
          name: 'leave',
          description: 'Make bot leave channel (admin)',
          type: CommandOptionType.SUB_COMMAND
        }
      ]
    })
    this.voiceLog = creator.client.voiceLog
  }

  async run(ctx: CommandContext) {
    if (ctx.options.join) {
      this.voiceLog.command.commandJoin(ctx)
    }
    if (ctx.options.leave) {
      this.voiceLog.command.commandLeave(ctx)
    }
  }
}
