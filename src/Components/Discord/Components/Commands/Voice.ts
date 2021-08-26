import { CommandContext, CommandOptionType, SlashCommand, SlashCreator } from 'slash-create';
import { VoiceLog } from '../VoiceLog';

export class VoiceCommand extends SlashCommand {
    private voiceLog: VoiceLog;
    constructor(creator: SlashCreator, guildIDs: string[], voiceLog: VoiceLog) {
        super(creator, {
            name: 'voice',
            description: 'VoiceLog voice option',
            guildIDs,
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
        });
        this.voiceLog = voiceLog;
    }

    async run(ctx: CommandContext) {
        if (ctx.options.join) {
            this.voiceLog.command.commandJoin(ctx);
        }
        if (ctx.options.leave) {
            this.voiceLog.command.commandLeave(ctx);
        }
    }
}