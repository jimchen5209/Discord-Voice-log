export interface IPluginBase {
  pluginName: string
  description: string
}

interface IPluginConstructor {
  new (): undefined
}

declare const IPluginBase: IPluginConstructor
