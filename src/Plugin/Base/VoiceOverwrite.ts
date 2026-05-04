import type { Member } from '@projectdysnomia/dysnomia'
import type { IPluginBase } from './PluginBase'

export interface IVoiceOverwrite extends IPluginBase {
  typeVoiceOverwrite: boolean

  playVoice(member: Member, type: string): Promise<string | undefined>
}
