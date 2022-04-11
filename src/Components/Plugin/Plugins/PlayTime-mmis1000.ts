import { Member } from 'eris';
import { Core } from '../../..';
import { TTSHelper } from '../../../Core/TTSHelper';
import { IVoiceOverwrite } from '../Base/VoiceOverwrite';

export class PlayTime_mmis1000 implements IVoiceOverwrite{
    public pluginName = '殘風報時器';
    public description = '9 點到了';
    typeVoiceOverwrite = true;
    private ttsHelper: TTSHelper;

    constructor(core: Core) {
        this.ttsHelper = core.ttsHelper;
    }

    public async playVoice(member: Member, type: string): Promise<string | undefined> {
        if (member.id === '275570140794322946' && (type === 'switched_in' || type === 'join')) {
            const nowTime = new Date();
            if (nowTime.getHours() >=0 && nowTime.getHours() < 18) return;
            const nineOClock = new Date(nowTime.getFullYear(), nowTime.getMonth(), nowTime.getDate(), 21, 0, 0);
            const time = (nowTime.getTime() - nineOClock.getTime()) / 60000;
            const text = `9 點 ${(time > 0)? Math.floor(time) : Math.ceil(time)} 分到了`;
            const lang = 'zh_tw';

            const file = await this.ttsHelper.getTTSFile(text, lang);
            if (file && file.length !== 0) return file;
        }

        return;
    }
}
