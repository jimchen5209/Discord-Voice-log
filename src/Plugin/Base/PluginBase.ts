
export interface IPluginBase {
  pluginName:string;
  description:string;
}

interface IPluginConstructor {
  new(): void;
}

declare const IPluginBase: IPluginConstructor
