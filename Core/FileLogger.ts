import fs from 'fs';
import moment from 'moment';
import { AbstractCategoryLogger, Category, CategoryLogMessage, LogLevel, RuntimeSettings } from 'typescript-logging';

export class FileLogger extends AbstractCategoryLogger {
    private logPath: string;

    // The first two parameters are required, the 3rd is our parameter
    // where we give this logger an array and log all messages to that array.
    constructor(category: Category, runtimeSettings: RuntimeSettings, logPath: string) {
        super(category, runtimeSettings);
        this.logPath = logPath;
    }

    // This is the only thing you really need to implement. In this case
    // we just write the complete message to the array.
    protected doLog(msg: CategoryLogMessage): void {
        // Note: we use createDefaultLogMessage() to spit it out formatted and all
        // however you're free to print in any way you like, the data is all
        // present on the message.
        const time = moment(msg.date).format('YYYY-MM-DD HH:mm:ss,SSS');

        const categories: string[] = [];
        msg.categories.forEach((value: Category) => {
            categories.push(value.name);
        });

        const message = `[${time}][${categories.join('/')}][${LogLevel[msg.level].toString()}] ${msg.messageAsString}`;
        console.log(message);
        fs.appendFileSync(this.logPath, `${message}\n`);
    }
}
