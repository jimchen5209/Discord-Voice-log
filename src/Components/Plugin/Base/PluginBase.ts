import { Core } from '../../..';

export interface IPluginBase {
    pluginName:string;
    description:string;
}

interface IPluginConstructor {
    new(core: Core): void;
}

declare const IPluginBase: IPluginConstructor;