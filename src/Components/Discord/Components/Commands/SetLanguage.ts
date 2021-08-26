import { CommandContext, SlashCommand, SlashCreator } from 'slash-create';
import { Lang } from '../../../../Core/Lang';
import { VoiceLog } from '../VoiceLog';

export class SetLanguageCommand extends SlashCommand {
    private voiceLog: VoiceLog;
    constructor(creator: SlashCreator, guildIDs: string[], lang: Lang, voiceLog: VoiceLog) {
        super(creator, {
            name: 'language',
            description: 'Set voiceLog language (admin)',
            guildIDs,
            options: lang.genOptions(true)
        });
        this.voiceLog = voiceLog;
    }

    async run(ctx: CommandContext) {
        this.voiceLog.command.commandLang(ctx);
    }
}