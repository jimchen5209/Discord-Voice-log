import { CommandContext, CommandOptionType, SlashCommand, SlashCreator } from 'slash-create'
import { VoiceLog } from '../../VoiceLog/VoiceLog'
import { Lang } from '../../../Lang'

export class LogCommand extends SlashCommand {
  private voiceLog: VoiceLog
  constructor(creator: SlashCreator, guildIDs: string[], lang: Lang, voiceLog: VoiceLog) {
    super(creator, {
      name: 'log',
      description: 'VoiceLog log option',
      guildIDs,
      options: [
        {
          name: 'set',
          description: 'Set and enable voiceLog (admin)',
          type: CommandOptionType.SUB_COMMAND,
          options: lang.genOptions(false)
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
          options: lang.genOptions(true)
        }
      ]
    })
    this.voiceLog = voiceLog
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
