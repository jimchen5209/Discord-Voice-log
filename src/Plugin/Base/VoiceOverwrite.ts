/* eslint-disable no-unused-vars -- definition file*/
import { Member } from '@projectdysnomia/dysnomia'
import { IPluginBase } from './PluginBase'

export interface IVoiceOverwrite extends IPluginBase {
  typeVoiceOverwrite: boolean;

  playVoice(member: Member, type: string): Promise<string | undefined>;
}
