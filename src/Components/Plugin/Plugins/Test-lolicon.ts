import { Member } from 'eris';
import { Core } from '../../..';
import { TTSHelper } from '../../../Core/TTSHelper';
import { IVoiceOverwrite } from '../Base/VoiceOverwrite';

export class Test_lolicon implements IVoiceOverwrite{
    public pluginName = '小瑞克統測倒數';
    public description = '要統測了不讀書？';
    typeVoiceOverwrite = true;
    private ttsHelper: TTSHelper;

    constructor(core: Core) {
        this.ttsHelper = core.ttsHelper;
    }

    public async playVoice(member: Member, type: string): Promise<string | undefined> {
        if (member.id === '404534959794159626' && (type === 'switched_in' || type === 'join')) {
            const nowTime = new Date();
            const testTime = new Date('04/30/2022');
            const time = Math.ceil((testTime.getTime() - nowTime.getTime()) / (1000 * 3600 * 24)) - 1;
            const text = (time < 0) ? '早安小瑞克，統測結束了，是不是要準備買顯卡了' : `早安小瑞克，統測剩下 ${time} 天喔`;
            const lang = 'zh_tw';

            const file = await this.ttsHelper.getTTSFile(text, lang);
            if (file && file.length !== 0) return file;
        }

        return;
    }
}