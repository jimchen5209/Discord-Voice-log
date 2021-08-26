import { CommandContext, SlashCommand, SlashCreator } from 'slash-create';
import { VoiceLog } from '../VoiceLog';

export class LeaveCommand extends SlashCommand {
    private voiceLog: VoiceLog;
    constructor(creator: SlashCreator, guildIDs: string[], voiceLog: VoiceLog) {
        super(creator, {
            name: 'leave',
            description: 'Make bot leave channel (admin)',
            guildIDs
        });
        this.voiceLog = voiceLog;
    }

    async run(ctx: CommandContext) {
        this.voiceLog.command.commandLeave(ctx);
    }
}