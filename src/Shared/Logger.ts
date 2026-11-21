import type { ILogObj, ISettingsParam } from 'tslog'

export const loggerOptions: ISettingsParam<ILogObj> = {
  name: 'Main',
  prettyLogTimeZone: 'local',
  hideLogPositionForProduction: true,
  minLevel: 3 // Info
}
