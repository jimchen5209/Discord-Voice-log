import { Member, VoiceChannel, MessageContent, CommandClient, TextChannel } from 'eris';
import { Category } from 'logging-ts';
import { vsprintf } from 'sprintf-js';
import { Core } from '../../../..';
import { Lang } from '../../../../Core/Lang';
import { ServerConfigManager } from '../../../../Core/ServerConfigManager';
import { Discord } from '../../Core';

const ERR_UNEXPECTED_LANG_STATUS = new Error('Unexpected lang set status');
const ERR_NO_PERMRSSION = new Error('Unexpected lang set status');

export enum VoiceLogSetStatus {
    AllSuccess,
    NotChanged,
    ChannelSuccess,
    LangSuccess,
    MissingLang,
    ChannelSuccess_MissingLang
}

export class VoiceLogText {
    private bot: CommandClient;
    private logger: Category;
    private data: ServerConfigManager;
    private lang: Lang;

    constructor(core: Core, discord: Discord,bot: CommandClient, logger: Category) {
        this.bot = bot;
        this.logger = new Category('VoiceLog/Text', logger);
        this.data = core.data;
        this.lang = discord.lang;
    }

    public async setVoiceLog(guildId: string, channelId: string, lang: string | undefined = undefined): Promise<VoiceLogSetStatus> {
        const permissionCheck = ((this.bot.getChannel(channelId)) as TextChannel).permissionsOf(this.bot.user.id);
        if (!permissionCheck.has('sendMessages') || !permissionCheck.has('embedLinks')) {
            this.logger.error('Not enough permissions to send message', null);
            throw ERR_NO_PERMRSSION;
        }

        const data = await this.data.getOrCreate(guildId);
        if (lang) {
            if (data.channelID === channelId && data.lang === lang) return VoiceLogSetStatus.NotChanged;
            if (data.channelID === channelId) {
                return await this.setLang(guildId, lang);
            } else {
                await this.data.updateChannel(guildId, channelId);
                switch (await this.setLang(guildId, lang)) {
                    case VoiceLogSetStatus.LangSuccess:
                        return VoiceLogSetStatus.AllSuccess;
                    case VoiceLogSetStatus.MissingLang:
                        return VoiceLogSetStatus.ChannelSuccess_MissingLang;
                    case VoiceLogSetStatus.NotChanged:
                        return VoiceLogSetStatus.ChannelSuccess;
                    default:
                        this.logger.error('Unexpected lang set status', null);
                        throw ERR_UNEXPECTED_LANG_STATUS;
                }
            }
        } else {
            if (data.channelID === channelId) return VoiceLogSetStatus.NotChanged;

            await this.data.updateChannel(guildId, channelId);
            return VoiceLogSetStatus.ChannelSuccess;
        }
    }

    public async setLang(guildId: string, lang: string): Promise<VoiceLogSetStatus> {
        if (!this.lang.isExist(lang)) return VoiceLogSetStatus.MissingLang;

        const data = await this.data.getOrCreate(guildId);

        if (data.lang === lang) return VoiceLogSetStatus.NotChanged;

        await this.data.updateLang(guildId, lang);
        return VoiceLogSetStatus.LangSuccess;
    }

    public async unsetVoiceLog(guildId: string) {
        await this.data.updateChannel(guildId, '');
    }

    public genVoiceLogEmbed(member: Member, lang: string, type: string, oldChannel: VoiceChannel | undefined, newChannel: VoiceChannel | undefined) {
        let color: number;
        let content: string;
        switch (type) {
            case 'join':
                color = 4289797;
                content = vsprintf(this.lang.get(lang).display.voice_log.joined, [newChannel?.name]);
                break;
            case 'leave':
                color = 8454161;
                content = vsprintf(this.lang.get(lang).display.voice_log.left, [oldChannel?.name]);
                break;
            case 'move':
                color = 10448150;
                content = vsprintf('%0s ▶️ %1s', [oldChannel?.name, newChannel?.name]);
                break;
            default:
                color = 6776679;
                content = 'Unknown type';
                break;
        }
        return {
            embed: {
                color,
                title: member.nick ? member.nick : member.username,
                description: content,
                timestamp: (new Date()).toISOString(),
                author: { name: '𝅺', icon_url: member.avatarURL }
            }
        } as MessageContent;
    }
}