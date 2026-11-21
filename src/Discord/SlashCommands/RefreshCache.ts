import { type CommandContext, SlashCommand, type SlashCreator } from 'slash-create'
import type { Command } from '../Command'

export class RefreshCacheCommand extends SlashCommand {
  private command: Command

  constructor(creator: SlashCreator, command: Command) {
    super(creator, {
      name: 'refresh_cache',
      description: 'Download and cache all tts file (bot operator)',
      guildIDs: creator.client.guildIDs
    })
    this.command = command
  }

  async run(ctx: CommandContext) {
    this.command.dispatch('refresh_cache', ctx)
  }
}
