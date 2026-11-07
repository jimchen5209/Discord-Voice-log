import { type CommandContext, CommandOptionType, SlashCommand, type SlashCreator } from 'slash-create'
import { instances } from '../../../../Utils/Instances'
import type { VoiceLog } from '../../VoiceLog/VoiceLog'

export class LogCommand extends SlashCommand {
  private voiceLog: VoiceLog

  constructor(creator: SlashCreator) {
    super(creator, {
      name: 'log',
      description: 'VoiceLog log option',
      guildIDs: creator.client.guildIDs,
      options: [
        {
          name: 'set',
          description: 'Set and enable voiceLog (admin)',
          type: CommandOptionType.SUB_COMMAND,
          options: instances.lang.genOptions(true)
        },
        {
          name: 'unset',
          description: 'Disable voiceLog (admin)',
          type: CommandOptionType.SUB_COMMAND
        },
        {
          name: 'language',
          description: 'Set voiceLog language (admin)',
          type: CommandOptionType.SUB_COMMAND,
          options: instances.lang.genOptions(true)
        }
      ]
    })
    this.voiceLog = creator.client.voiceLog
  }

  async run(ctx: CommandContext) {
    if (ctx.options.set) {
      this.voiceLog.command.commandSetVoiceLog(ctx)
    }
    if (ctx.options.unset) {
      this.voiceLog.command.commandUnsetVoiceLog(ctx)
    }
    if (ctx.options.language) {
      this.voiceLog.command.commandLang(ctx)
    }
  }
}
