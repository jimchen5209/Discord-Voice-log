import { CommandContext, SlashCommand, SlashCreator } from 'slash-create';
import { Lang } from '../../../../Core/Lang';
import { VoiceLog } from '../VoiceLog';

export class SetVoiceLogCommand extends SlashCommand {
    private voiceLog: VoiceLog;
    constructor(creator: SlashCreator, guildIDs: string[], lang: Lang, voiceLog: VoiceLog) {
        super(creator, {
            name: 'set',
            description: 'Set and enable voiceLog (admin)',
            guildIDs,
            options: lang.genOptions(false)
        });
        this.voiceLog = voiceLog;
    }

    async run(ctx: CommandContext) {
        this.voiceLog.command.commandsetVlog(ctx);
    }
}