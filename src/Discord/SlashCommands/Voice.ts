import { type CommandContext, CommandOptionType, SlashCommand, type SlashCreator } from 'slash-create'
import type { Lang } from '../../Shared/Lang'
import type { Command } from '../Command'
import { genChoice } from './options'

export class VoiceCommand extends SlashCommand {
  private command: Command

  constructor(creator: SlashCreator, command: Command, lang: Lang, ttsProviderIds: string[]) {
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
        },
        {
          name: 'tts',
          description: 'Voice Message TTS setting (admin)',
          type: CommandOptionType.SUB_COMMAND,
          options: [
            {
              name: 'enabled',
              description: 'Enable/Disable TTS',
              type: CommandOptionType.BOOLEAN
            },
            {
              name: 'provider',
              description: 'TTS provider',
              type: CommandOptionType.STRING,
              choices: ttsProviderIds.map((id) => ({ name: id, value: id }))
            },
            {
              name: 'message_lang',
              description: 'Message language for TTS parsing',
              type: CommandOptionType.STRING,
              choices: genChoice(lang)
            },
            {
              name: 'voice_lang',
              description: 'Voice language code (e.g. en-US, zh-TW)',
              type: CommandOptionType.STRING
            },
            {
              name: 'voice_name',
              description: 'Voice name (e.g. en-US-Wavenet-A)',
              type: CommandOptionType.STRING
            }
          ]
        }
      ]
    })
    this.command = command
  }

  async run(ctx: CommandContext) {
    if (ctx.options.join) {
      this.command.dispatch('voice.join', ctx)
    }
    if (ctx.options.leave) {
      this.command.dispatch('voice.leave', ctx)
    }
    if (ctx.options.tts) {
      this.command.dispatch('voice.tts', ctx, ctx.options.tts)
    }
  }
}
