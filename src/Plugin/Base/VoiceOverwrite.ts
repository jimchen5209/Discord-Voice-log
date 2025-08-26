import type { Member } from 'eris'
import type { IPluginBase } from './PluginBase'

export interface IVoiceOverwrite extends IPluginBase {
  typeVoiceOverwrite: boolean

  playVoice(member: Member, type: string): Promise<string | undefined>
}
