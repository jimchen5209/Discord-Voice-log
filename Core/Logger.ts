import fs from 'fs';
import moment from 'moment';
import { Category, CategoryConfiguration, CategoryLogFormat, CategoryServiceFactory, LoggerType, LogLevel, RuntimeSettings } from 'typescript-logging';
import { FileLogger } from './FileLogger';

if (!fs.existsSync('./logs')) fs.mkdirSync('./logs');
const logPath = `./logs/${moment().format('YYYY-MM-DD-HH-mm-ss')}.log`;

const defaultConfig = new CategoryConfiguration(
    LogLevel.Info, LoggerType.Custom, new CategoryLogFormat(),
    (category: Category, runtimeSettings: RuntimeSettings) => new FileLogger(category, runtimeSettings, logPath)
);
CategoryServiceFactory.setDefaultConfiguration(defaultConfig);
export const catService = new Category('Main');
