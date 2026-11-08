import type { MemberView } from '../../Platform/Views'
import type { IPluginBase } from './PluginBase'

export interface IVoiceOverwrite extends IPluginBase {
  typeVoiceOverwrite: boolean

  playVoice(member: MemberView, type: string): Promise<string | undefined>
}
