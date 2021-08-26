import { CommandContext, SlashCommand, SlashCreator } from 'slash-create';
import { VoiceLog } from '../VoiceLog';

export class JoinCommand extends SlashCommand {
    private voiceLog: VoiceLog;
    constructor(creator: SlashCreator, guildIDs: string[], voiceLog: VoiceLog) {
        super(creator, {
            name: 'join',
            description: 'Make bot join your channel (admin)',
            guildIDs
        });
        this.voiceLog = voiceLog;
    }

    async run(ctx: CommandContext) {
        this.voiceLog.command.commandJoin(ctx);
    }
}