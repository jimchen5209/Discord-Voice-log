import waitUntil from 'async-wait-until';
import { Client, VoiceChannel } from 'eris';
import { readdirSync, readFileSync, unlinkSync } from 'fs';
import { Category } from 'logging-ts';
import path from 'path';
import Queue from 'promise-queue';
import { CommandContext, MessageEmbedOptions } from 'slash-create';
import { Core } from '../../../..';
import { ServerConfigManager } from '../../../MongoDB/db/ServerConfig';
import { TTSHelper } from '../../../../Core/TTSHelper';
import { Discord } from '../../Core';
import { DiscordVoice } from '../Voice';
import { PluginManager } from '../../../Plugin/Core';

export class VoiceLogVoice {
    private bot: Client;
    private audios: { [key: string]: DiscordVoice } = {};
    private logger: Category;
    private voiceLogger: Category;
    private data: ServerConfigManager;
    private ttsHelper: TTSHelper;
    private plugins: PluginManager;

    constructor(core: Core, discord: Discord, bot: Client, logger: Category) {
        this.bot = bot;
        this.logger = new Category('VoiceLog/Voice', logger);
        this.voiceLogger = new Category('Discord/Voice', logger);
        this.data = core.data;
        this.ttsHelper = discord.ttsHelper;
        this.plugins = core.plugins;
    }

    public getCurrentVoice(guildId: string): DiscordVoice | undefined {
        const voice = this.audios[guildId];
        if (!voice) {
            const botVoice = this.bot.voiceConnections.get(guildId);
            if (botVoice && botVoice.ready) {
                if (botVoice.channelID) this.audios[guildId] = new DiscordVoice(this.bot, this.voiceLogger, this.plugins, this.ttsHelper, botVoice.channelID, botVoice);
                return this.audios[guildId];
            }
            return undefined;
        } else if (!voice.isReady()) {
            this.destroy(guildId);
            return undefined;
        }

        return this.audios[guildId];
    }

    public async join(guildId: string, channelId: string, updateDatabase = false, playJoin = false): Promise<DiscordVoice> {
        if (this.audios[guildId]) {
            if (!this.audios[guildId].isReady() && !this.audios[guildId].init) {
                this.destroy(guildId);
            } else if (this.audios[guildId].channelId !== channelId) {
                this.audios[guildId].switchChannel(channelId);

                if (updateDatabase) {
                    this.data.updateLastVoiceChannel(guildId, '');
                    this.data.updateCurrentVoiceChannel(guildId, channelId);
                }

                if (playJoin) this.audios[guildId].playMoved();
                return this.audios[guildId];
            } else {
                return this.audios[guildId];
            }
        }

        this.audios[guildId] = new DiscordVoice(this.bot, this.voiceLogger, this.plugins, this.ttsHelper, channelId);
        await waitUntil(() => this.audios[guildId] && this.audios[guildId].isReady());
        if (updateDatabase) {
            this.data.updateLastVoiceChannel(guildId, '');
            this.data.updateCurrentVoiceChannel(guildId, channelId);
        }

        if (playJoin) this.audios[guildId].playReady();

        return this.audios[guildId];
    }

    public async destroy(guildId: string, updateDatabase = false) {
        this.audios[guildId].destroy();
        delete this.audios[guildId];
        if (updateDatabase) {
            this.data.updateLastVoiceChannel(guildId, '');
            this.data.updateCurrentVoiceChannel(guildId, '');
        }
    }

    private async sleep(guildId: string, channelId: string) {
        this.destroy(guildId);
        this.data.updateLastVoiceChannel(guildId, channelId);
        this.data.updateCurrentVoiceChannel(guildId, '');
    }

    public async refreshCache(context: CommandContext | undefined) {
        this.logger.info('Starting cache refresh...');
        const title = '➡️ Refreshing Caches';
        let seekCounter = 0;
        let seekFilename = '';
        let seekDone = false;
        let seekField = {
            name: `${seekDone ? '✅' : '➡️'} Seeking for files ...${seekDone ? ' Done' : ''}`,
            value: `${(seekDone || seekCounter === 0) ? '' : `Current ${seekFilename}, `} Seeked ${seekCounter} files. `
        };
        let progressMessage = this.genProgressMessage(title, [seekField]);
        await context?.send({ embeds: [progressMessage] });
        let progressCount = 0;
        let progressTotal = 0;
        const queue = new Queue(1, Infinity);
        const getTTS = (text: string, lang: string) => {
            // eslint-disable-next-line no-async-promise-executor
            return new Promise<void>(async (res) => {
                progressCount++;
                const progressField = {
                    name: '➡️ Processing texts...',
                    value: `(${progressCount}/${progressTotal}) ${text} in ${lang}`
                };
                progressMessage = this.genProgressMessage(title, [seekField, progressField]);
                await context?.editOriginal({ embeds: [progressMessage] });
                this.ttsHelper.getTTSFile(text, lang).then(fileName => {
                    this.logger.info(`(${progressCount}/${progressTotal}) ${text} in ${lang} -> ${fileName}`);
                    if (fileName !== null) ttsList.push(fileName);
                    setTimeout(() => { res(); }, 500);
                });
            });
        };
        const getWaveTTS = (text: string, lang: string, voice: string) => {
            // eslint-disable-next-line no-async-promise-executor
            return new Promise<void>(async (res) => {
                progressCount++;
                const progressField = {
                    name: '➡️ Processing texts...',
                    value: `(${progressCount}/${progressTotal}) ${text} in ${lang} with voice ${voice}`
                };
                progressMessage = this.genProgressMessage(title, [seekField, progressField]);
                await context?.editOriginal({ embeds: [progressMessage] });
                this.ttsHelper.getWaveTTS(text, lang, voice).then(fileName => {
                    this.logger.info(`(${progressCount}/${progressTotal}) ${text} in ${lang} with voice ${voice} -> ${fileName}`);
                    if (fileName !== null) ttsList.push(fileName);
                    setTimeout(() => { res(); }, 500);
                });
            });
        };
        const ttsList: string[] = [];
        queue.add(() => getWaveTTS('VoiceLog is moved to your channel.', 'en-US', 'en-US-Wavenet-D'));
        queue.add(() => getWaveTTS('VoiceLog is ready.', 'en-US', 'en-US-Wavenet-D'));
        progressTotal += 2;
        const typeList = ['join', 'left', 'switched_out', 'switched_in'];
        const files = readdirSync('assets/');
        files.forEach(file => {
            if (path.extname(file) === '.json') {
                seekCounter++;
                seekFilename = file;
                seekField = {
                    name: `${seekDone ? '✅' : '➡️'} Seeking for files ...${seekDone ? ' Done' : ''}`,
                    value: `${(seekDone || seekCounter === 0) ? '' : `Current ${seekFilename}, `} Seeked ${seekCounter} files. `
                };
                const tts = JSON.parse(readFileSync(`assets/${file}`, { encoding: 'utf-8' }));
                if (tts.use_wave_tts && tts.lang && tts.voice) {
                    typeList.forEach(type => {
                        if (tts[type]) {
                            progressTotal++;
                            queue.add(() => getWaveTTS(tts[type], tts.lang, tts.voice));
                        }
                    });
                } else if (tts.lang) {
                    typeList.forEach(type => {
                        if (tts[type]) {
                            progressTotal++;
                            queue.add(() => getTTS(tts[type], tts.lang));
                        }
                    });
                }
            }
        });
        seekDone = true;
        seekField = {
            name: `${seekDone ? '✅' : '➡️'} Seeking for files ...${seekDone ? ' Done' : ''}`,
            value: `${(seekDone || seekCounter === 0) ? '' : `Current ${seekFilename}, `} Seeked ${seekCounter} files. `
        };
        const afterWork = () => {
            // eslint-disable-next-line no-async-promise-executor
            return new Promise<void>(async (res) => {
                const progressField = {
                    name: '✅ Processing files... Done',
                    value: `Processed ${progressTotal} texts.`
                };
                let cacheRemoveCount = 0;
                let cacheField = {
                    name: '➡️ Removing unused cache...',
                    value: (cacheRemoveCount === 0) ? 'Seeking...' : `Removed ${cacheRemoveCount} unused ${(cacheRemoveCount === 1) ? 'cache' : 'caches'}.`
                };
                progressMessage = this.genProgressMessage(title, [seekField, progressField, cacheField]);
                await context?.editOriginal({ embeds: [progressMessage] });
                const cacheFiles = readdirSync('caches/');
                cacheFiles.forEach(async file => {
                    if (!ttsList.includes(`./caches/${file}`)) {
                        unlinkSync(`./caches/${file}`);
                        this.logger.info(`Deleted unused file ./caches/${file}`);
                        cacheRemoveCount++;
                        progressMessage = this.genProgressMessage(title, [seekField, progressField, cacheField]);
                        await context?.editOriginal({ embeds: [progressMessage] });
                    }
                });
                cacheField = {
                    name: '✅ Removing unused cache... Done',
                    value: (cacheRemoveCount === 0) ? 'No unused caches found.' : `Removed ${cacheRemoveCount} unused ${(cacheRemoveCount === 1) ? 'cache' : 'caches'}.`
                };
                progressMessage = this.genProgressMessage('✅ Refresh Caches Done', [seekField, progressField, cacheField], true);
                await context?.editOriginal({ embeds: [progressMessage] });
                res();
            });
        };
        queue.add(() => afterWork());
    }

    private genProgressMessage(title: string, fields: Array<{ name: string, value: string }>, isDone = false) {
        return {
            color: (isDone) ? 4289797 : 16312092,
            title,
            fields
        } as MessageEmbedOptions;
    }

    public async autoLeaveChannel(oldChannel: VoiceChannel | undefined, newChannel: VoiceChannel | undefined, guildId: string): Promise<string | undefined> {
        let channelToCheck: VoiceChannel | undefined;

        const voice = this.getCurrentVoice(guildId);
        const data = await this.data.get(guildId);

        if (voice?.isReady()) {
            channelToCheck = (oldChannel?.id === voice?.channelId) ? oldChannel : ((newChannel?.id === voice?.channelId) ? newChannel : undefined);
        } else if (data) {
            channelToCheck = (oldChannel?.id === data.lastVoiceChannel) ? oldChannel : ((newChannel?.id === data.lastVoiceChannel) ? newChannel : undefined);
        }

        if (!channelToCheck) return;

        let noUser = true;

        channelToCheck.voiceMembers?.forEach(user => {
            if (!user.bot) {
                noUser = false;
                return;
            }
        });

        if (noUser) {
            if (voice) {
                await this.sleep(guildId, channelToCheck.id);
            }
            return;
        } else {
            await this.join(guildId, channelToCheck.id, true);
            return channelToCheck.id;
        }
    }
}
