import { type CommandContext, CommandOptionType, SlashCommand, type SlashCreator } from 'slash-create'
import type { Lang } from '../../Shared/Lang'
import type { Command } from '../Command'
import { genOptions } from './options'

export class LogCommand extends SlashCommand {
  private command: Command

  constructor(creator: SlashCreator, command: Command, lang: Lang) {
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
    this.command = command
  }

  async run(ctx: CommandContext) {
    if (ctx.options.set) {
      this.command.dispatch('log.set', ctx, ctx.options.set)
    }
    if (ctx.options.unset) {
      this.command.dispatch('log.unset', ctx)
    }
    if (ctx.options.language) {
      this.command.dispatch('log.language', ctx, ctx.options.language)
    }
  }
}
