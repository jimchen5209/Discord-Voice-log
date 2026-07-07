import { type CommandContext, CommandOptionType, SlashCommand, type SlashCreator } from 'slash-create'
import { instances } from '../../../../Utils/Instances'
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
              name: 'type',
              description: 'TTS Type',
              type: CommandOptionType.STRING,
              choices: [
                { name: 'WaveNet', value: 'WaveNet' },
                { name: 'Legacy', value: 'Legacy' }
              ]
            },
            {
              name: 'message_lang',
              description: 'Message language for TTS parsing',
              type: CommandOptionType.STRING,
              choices: instances.lang.genChoice()
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
    this.voiceLog = creator.client.voiceLog
  }

  async run(ctx: CommandContext) {
    if (ctx.options.join) {
      this.voiceLog.command.commandJoin(ctx)
    }
    if (ctx.options.leave) {
      this.voiceLog.command.commandLeave(ctx)
    }
    if (ctx.options.tts) {
      this.voiceLog.command.commandSetTTS(ctx)
    }
  }
}
