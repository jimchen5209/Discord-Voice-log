import { Member } from 'eris'
import { IVoiceOverwrite } from '../Base/VoiceOverwrite'
import { instances } from '../../Utils/Instances'
import { TTSHelper } from '../../Utils/TTSHelper'

// eslint-disable-next-line camelcase
export class PlayTime_mmis1000 implements IVoiceOverwrite {
  public pluginName = '殘風報時器'
  public description = '11 點到了'
  typeVoiceOverwrite = true
  private ttsHelper: TTSHelper

  constructor() {
    this.ttsHelper = instances.ttsHelper
  }

  public async playVoice(member: Member, type: string): Promise<string | undefined> {
    if (member.id === '275570140794322946' && (type === 'switched_in' || type === 'join')) {
      const nowTime = new Date()
      if (nowTime.getHours() >=2 && nowTime.getHours() < 18) return
      let day = nowTime.getDate()
      if (nowTime.getHours() >= 0 && nowTime.getHours() < 2) day -= 1
      const nineOClock = new Date(nowTime.getFullYear(), nowTime.getMonth(), day, 23, 0, 0)
      const time = (nowTime.getTime() - nineOClock.getTime()) / 60000
      const timeInt = Math.floor(time)

      const text = this.timeString(11, timeInt)
      const lang = 'zh_tw'

      const file = await this.ttsHelper.getTTSFile(text, lang)
      if (file && file.length !== 0) return file
    }


  }

  private timeString(hour: number, minute: number): string {
    const hourText = this.numberToString(hour, false)
    const minuteText = this.numberToString(minute, true)
    return `${hourText}點${((minute !== 0) ? `${minuteText}分` : '')}到了`
  }

  private numberToString(number: number, addZero: boolean): string {
    let text = (number < 0) ? '負' : ''
    const parseNumber = Math.abs(number)

    const splittedText = parseNumber.toString().split('').reverse()

    if (parseNumber >= 1000) {
      text += `${this.digitToString(splittedText[3])}千`
    }

    if (parseNumber >= 100) {
      text += `${this.digitToString(splittedText[2])}百`
    }

    if (parseNumber >= 10) {
      text += (splittedText[1] !== '1' || parseNumber >= 100) ? `${this.digitToString(splittedText[1])}十` : '十'
      text += (splittedText[0] !== '0') ? `${this.digitToString(splittedText[0])}` : ''
    } else if (parseNumber === 0) {
      text += '零'
    } else {
      text += `${(((addZero && number > 0) || parseNumber >= 100) ? '零' : '')}${this.digitToString(splittedText[0])}`
    }

    return text
  }

  private digitToString(digit: string): string {
    switch (digit) {
      case '0':
        return '零'
      case '1':
        return '一'
      case '2':
        return '二'
      case '3':
        return '三'
      case '4':
        return '四'
      case '5':
        return '五'
      case '6':
        return '六'
      case '7':
        return '七'
      case '8':
        return '八'
      case '9':
        return '九'
      default:
        throw Error('digit must between 0 to 9')
    }
  }
}
