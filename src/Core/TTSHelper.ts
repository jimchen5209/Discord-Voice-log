import { createWriteStream, existsSync } from 'fs';
import { Category } from 'logging-ts';
import md5 from 'md5';
import fetch, { RequestInit } from 'node-fetch';
import { pipeline, Readable } from 'stream';
import { promisify } from 'util';
import { Core } from '..';
import { Config } from './Config';
const streamPipeline = promisify(pipeline);

export class TTSHelper {
    private logger: Category;
    private config: Config;

    constructor(core: Core) {
        this.logger = new Category('TTSHelper', core.mainLogger);
        this.config = core.config;
    }

    public async getTTSFile(text: string, lang: string): Promise<string | null> {
        const filePath = `./caches/${md5(`${text}-${lang}`)}.opus`;
        if (!existsSync(filePath)) {
            const ttsURL = encodeURI(`https://translate.google.com.tw/translate_tts?ie=UTF-8&q=${text}&tl=${lang}&client=tw-ob`);
            try {
                await this.download(ttsURL, filePath);
            } catch (error) {
                if (error instanceof Error) {
                    this.logger.error(`TTS ${text} in ${lang} download failed: ${error.message}`, null);
                }
                return null;
            }
        }
        return filePath;
    }

    public async getWaveTTS(text: string, lang: string, voice: string): Promise<string> {
        const filePath = `./caches/${md5(`${text}-${lang}-${voice}`)}.opus`;
        if (!existsSync(filePath)) {
            const key = this.config.googleTTS.apiKey;
            const url = `https://content-texttospeech.googleapis.com/v1/text:synthesize?alt=json&key=${key}`;
            const options = {
                body: `{"input":{"text":"${text}"},"voice":{"name":"${voice}","languageCode":"${lang}"},"audioConfig":{"audioEncoding":"OGG_OPUS"}}`,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Origin': 'https://explorer.apis.google.com',
                    'X-Referer': 'https://explorer.apis.google.com',
                },
                method: 'POST',
            };
            await this.downloadWaveTTS(url, options, filePath);
        }
        return filePath;
    }

    private async download(url: string, path: string) {
        await fetch(url)
            .then(res => {
                if (!res.ok) {
                    throw new Error(`unexpected response ${res.statusText}`);
                }

                if (!res.body) {
                    throw new Error('response body is null');
                }

                return streamPipeline(res.body, createWriteStream(path)) ;
            });
    }

    private async downloadWaveTTS(url: string, options: RequestInit, path: string) {
        await fetch(url, options)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .then(response => response.json() as any)
            .then(data => {
                const imgBuffer = Buffer.from(data.audioContent, 'base64');

                const s = new Readable();

                s.push(imgBuffer);
                s.push(null);

                s.pipe(createWriteStream(path));
            });
    }
}
