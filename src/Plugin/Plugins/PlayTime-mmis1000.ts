import { getApp } from '../../App/App'
import type { MemberView } from '../../Platform/Views'
import type { IVoiceOverwrite } from '../Base/VoiceOverwrite'

// The user this plugin announces, per platform
const TARGET_USER_IDS: Record<string, string> = {
  discord: '275570140794322946',
  fluxer: '1568981359668494336'
}

// biome-ignore lint/style/useNamingConvention: username
export class PlayTime_mmis1000 implements IVoiceOverwrite {
  public pluginName = '殘風報時器'
  public description = '11 點到了'
  typeVoiceOverwrite = true

  public async playVoice(member: MemberView, type: string): Promise<string | undefined> {
    if (member.userId === TARGET_USER_IDS[member.scope.platform] && (type === 'switched_in' || type === 'join')) {
      const nowTime = new Date()
      if (nowTime.getHours() >= 2 && nowTime.getHours() < 18) return
      let day = nowTime.getDate()
      if (nowTime.getHours() >= 0 && nowTime.getHours() < 2) day -= 1
      const nineOClock = new Date(nowTime.getFullYear(), nowTime.getMonth(), day, 23, 0, 0)
      const time = (nowTime.getTime() - nineOClock.getTime()) / 60000
      const timeInt = Math.floor(time)

      const text = this.timeString(11, timeInt)

      // Google Translate makes PCM, the format Audio expects from a voice overwrite
      const file = await getApp().audio.synthesize({ provider: 'google-cloud', text, lang: 'cmn-TW', voice: 'cmn-TW-Wavenet-A' })
      if (file) return file
    }
  }

  private timeString(hour: number, minute: number): string {
    const hourText = this.numberToString(hour, false)
    const minuteText = this.numberToString(minute, minute > 0 && minute < 10)
    return `${hourText}點${minute !== 0 ? `${minuteText}分` : ''}到了`
  }

  private numberToString(number: number, addZero: boolean): string {
    const text = number < 0 ? '負' : ''
    const parseNumber = Math.abs(number)
    return parseNumber < 10 && addZero ? `${text}零${parseNumber}` : `${text}${parseNumber}`
  }
}
