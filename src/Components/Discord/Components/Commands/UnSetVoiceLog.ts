import { CommandContext, SlashCommand, SlashCreator } from 'slash-create';
import { VoiceLog } from '../VoiceLog';

export class UnSetVoiceLogCommand extends SlashCommand {
    private voiceLog: VoiceLog;
    constructor(creator: SlashCreator, guildIDs: string[], voiceLog: VoiceLog) {
        super(creator, {
            name: 'unset',
            description: 'Disable voiceLog (admin)',
            guildIDs
        });
        this.voiceLog = voiceLog;
    }

    async run(ctx: CommandContext) {
        this.voiceLog.command.commandUnsetVlog(ctx);
    }
}