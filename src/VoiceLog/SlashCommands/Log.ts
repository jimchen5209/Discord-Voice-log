import { type CommandContext, CommandOptionType, SlashCommand, type SlashCreator } from 'slash-create'
import type { Lang } from '../../Shared/Lang'
import type { VoiceLog } from '../VoiceLog'
import { genOptions } from './options'

export class LogCommand extends SlashCommand {
  private voiceLog: VoiceLog

  constructor(creator: SlashCreator, voiceLog: VoiceLog, lang: Lang) {
    super(creator, {
      name: 'log',
      description: 'VoiceLog log option',
      guildIDs: creator.client.guildIDs,
      options: [
        {
          name: 'set',
          description: 'Set and enable voiceLog (admin)',
          type: CommandOptionType.SUB_COMMAND,
          options: genOptions(lang, true)
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
          options: genOptions(lang, true)
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
