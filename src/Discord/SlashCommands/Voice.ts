import { type CommandContext, CommandOptionType, SlashCommand, type SlashCreator } from 'slash-create'
import { TTS_OPTION } from '../../Platform/Command'
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
              name: TTS_OPTION.enabled,
              description: 'Enable/Disable TTS',
              type: CommandOptionType.BOOLEAN
            },
            {
              name: TTS_OPTION.provider,
              description: 'TTS provider',
              type: CommandOptionType.STRING,
              choices: ttsProviderIds.map((id) => ({ name: id, value: id }))
            },
            {
              name: TTS_OPTION.messageLang,
              description: 'Message language for TTS parsing',
              type: CommandOptionType.STRING,
              choices: genChoice(lang)
            },
            {
              name: TTS_OPTION.voiceLang,
              description: 'Voice language code (e.g. en-US, zh-TW)',
              type: CommandOptionType.STRING
            },
            {
              name: TTS_OPTION.voiceName,
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
