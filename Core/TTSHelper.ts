import fs from 'fs';
import md5 from 'md5';
import fetch from 'node-fetch';
import stream from 'stream';
import { Category } from 'typescript-logging';
import util from 'util';
import { Core } from '..';
const streamPipeline = util.promisify(stream.pipeline);

export class TTSHelper {
    private logger: Category;

    constructor(core: Core) {
        this.logger = new Category('TTSHelper', core.mainLogger);
    }

    public async getTTSFile(text: string, lang: string): Promise<string | null> {
        const filePath = `./caches/${md5(`${text}-${lang}`)}.opus`;
        const ttsURL = encodeURI(`https://translate.google.com.tw/translate_tts?ie=UTF-8&q=${text}&tl=${lang}&client=tw-ob`);
        if (!fs.existsSync(filePath)) {
            try {
                await this.download(ttsURL, filePath);
            } catch (error) {
                this.logger.error(`TTS ${text} in ${lang} download failed: ${error.message}`, null);
                return null;
            }
        }
        return filePath;
    }

    private async download(url: string, path: string) {
        await fetch(url)
            .then(res => {
                if (!res.ok) {
                    throw new Error(`unexpected response ${res.statusText}`);
                }

                return streamPipeline(res.body, fs.createWriteStream(path));
            });
    }
}
