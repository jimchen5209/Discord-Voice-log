import type { Client } from '@projectdysnomia/dysnomia'
import waitUntil from 'async-wait-until'
import type { CommandContext, MessageEmbedOptions } from 'slash-create'
import { vsprintf } from 'sprintf-js'
import type { ILogObj, Logger } from 'tslog'
import { instances } from '../../../../Utils/Instances'
import type { DbServerConfigManager, IVoiceMessageTTS, VoiceMessageTTSType } from '../../../MongoDB/db/ServerConfig'
import type { Discord } from '../../Core'
import type { VoiceLog } from '../VoiceLog'
import { VoiceLogSetStatus } from './Text'

const ERR_MISSING_LANG = 'Language not exist.'
const ERR_MISSING_LANG_DEFAULT = 'Language not exist, will not change your language.'

export class VoiceLogCommands {
  private client: Client
  private voiceLog: VoiceLog
  private logger: Logger<ILogObj>
  private serverConfig: DbServerConfigManager

  constructor(voiceLog: VoiceLog, discord: Discord) {
    this.client = discord.client
    this.voiceLog = voiceLog
    this.serverConfig = voiceLog.serverConfig
    this.logger = voiceLog.logger.getSubLogger({ name: 'command' })
  }

  public async commandJoin(context: CommandContext) {
    if (!context.guildID || !context.member) return
    const member = await this.client.getRESTGuildMember(context.guildID, context.member.id)
    if (!member) return

    const data = await this.serverConfig.getOrCreate(member.guild.id)

    if (!member.permissions.has('manageMessages') && !instances.config.discord.admins.includes(member.id)) {
      await context.send({
        embeds: [this.genErrorMessage(instances.lang.get(data.lang).display.command.no_permission)],
        ephemeral: true
      })
      return
    }

    const guildId = member.guild.id
    const channelID = member.voiceState.channelID
    if (channelID) {
      const voice = this.voiceLog.voice.getCurrentVoice(guildId)
      if (voice && voice.channelId === channelID) {
        await context.send({
          embeds: [this.genNotChangedMessage(instances.lang.get(data.lang).display.command.already_connected)],
          ephemeral: true
        })
      } else {
        const newVoice = await this.voiceLog.voice.join(guildId, channelID, true, true)
        try {
          await waitUntil(() => newVoice?.isReady())
        } catch (error) {
          this.logger.error('Voice timed out', error)
          await context.send({
            embeds: [this.genErrorMessage(instances.lang.get(data.lang).display.command.error)],
            ephemeral: true
          })
          return
        }
        await context.send({
          embeds: [this.genSuccessMessage(instances.lang.get(data.lang).display.command.join_success)]
        })
      }
    } else {
      await context.send({
        embeds: [this.genErrorMessage(instances.lang.get(data.lang).display.command.not_in_channel)],
        ephemeral: true
      })
    }
  }

  public async commandLeave(context: CommandContext) {
    if (!context.guildID || !context.member) return
    const member = await this.client.getRESTGuildMember(context.guildID, context.member.id)
    if (!member) return

    const data = await this.serverConfig.getOrCreate(member.guild.id)

    if (!member.permissions.has('manageMessages') && !instances.config.discord.admins.includes(member.id)) {
      await context.send({
        embeds: [this.genErrorMessage(instances.lang.get(data.lang).display.command.no_permission)],
        ephemeral: true
      })
      return
    }
    const guildId = member.guild.id

    const voice = this.voiceLog.voice.getCurrentVoice(guildId)

    if (voice) {
      await this.voiceLog.voice.destroy(guildId, true)
      await context.send({
        embeds: [this.genSuccessMessage(instances.lang.get(data.lang).display.command.leave_success)]
      })
    } else {
      await context.send({
        embeds: [this.genNotChangedMessage(instances.lang.get(data.lang).display.command.bot_not_connected)],
        ephemeral: true
      })
    }
  }

  public async commandSetVoiceLog(context: CommandContext) {
    if (!context.guildID || !context.member) return
    const member = await this.client.getRESTGuildMember(context.guildID, context.member.id)
    if (!member) return

    const data = await this.serverConfig.getOrCreate(member.guild.id)

    if (!member.permissions.has('manageMessages') && !instances.config.discord.admins.includes(member.id)) {
      await context.send({
        embeds: [this.genErrorMessage(instances.lang.get(data.lang).display.command.no_permission)],
        ephemeral: true
      })
      return
    }

    const guildId = member.guild.id
    const channelId = context.channelID

    if (!context.options.set.language) {
      try {
        switch (await this.voiceLog.text.setVoiceLog(guildId, channelId)) {
          case VoiceLogSetStatus.NotChanged:
            await context.send({
              embeds: [this.genNotChangedMessage(instances.lang.get(data.lang).display.config.exist)],
              ephemeral: true
            })
            return
          case VoiceLogSetStatus.ChannelSuccess:
            await context.send({
              embeds: [this.genSuccessMessage(instances.lang.get(data.lang).display.config.success)]
            })
        }
      } catch {
        await context.send({
          embeds: [this.genErrorMessage(instances.lang.get(data.lang).display.config.error)],
          ephemeral: true
        })
      }
    } else {
      const newLang = context.options.set.language as string

      try {
        switch (await this.voiceLog.text.setVoiceLog(guildId, channelId, newLang)) {
          case VoiceLogSetStatus.AllSuccess:
            await context.send({
              embeds: [
                this.genSuccessMessage(vsprintf(instances.lang.get(newLang).display.config.lang_success, [instances.lang.get(newLang).displayName])),
                this.genSuccessMessage(instances.lang.get(newLang).display.config.success)
              ]
            })
            return
          case VoiceLogSetStatus.ChannelSuccess:
            await context.send({
              embeds: [this.genNotChangedMessage(vsprintf(instances.lang.get(data.lang).display.config.lang_exist, [instances.lang.get(data.lang).displayName]))],
              ephemeral: true
            })
            await context.send({
              embeds: [this.genSuccessMessage(instances.lang.get(data.lang).display.config.success)]
            })
            return
          case VoiceLogSetStatus.ChannelSuccessMissingLang:
            await context.send({
              embeds: [this.genErrorMessage(ERR_MISSING_LANG_DEFAULT)],
              ephemeral: true
            })
            await context.send({
              embeds: [this.genSuccessMessage(instances.lang.get(data.lang).display.config.success)]
            })
            return
          case VoiceLogSetStatus.LangSuccess:
            await context.send({
              embeds: [this.genSuccessMessage(vsprintf(instances.lang.get(newLang).display.config.lang_success, [instances.lang.get(newLang).displayName]))]
            })
            await context.send({
              embeds: [this.genNotChangedMessage(instances.lang.get(newLang).display.config.exist)],
              ephemeral: true
            })
            return
          case VoiceLogSetStatus.MissingLang:
            await context.send({
              embeds: [this.genErrorMessage(ERR_MISSING_LANG_DEFAULT), this.genNotChangedMessage(instances.lang.get(data.lang).display.config.exist)],
              ephemeral: true
            })
            return
          case VoiceLogSetStatus.NotChanged:
            await context.send({
              embeds: [
                this.genNotChangedMessage(vsprintf(instances.lang.get(data.lang).display.config.lang_exist, [instances.lang.get(data.lang).displayName])),
                this.genNotChangedMessage(instances.lang.get(data.lang).display.config.exist)
              ],
              ephemeral: true
            })
        }
      } catch {
        await context.send({
          embeds: [this.genErrorMessage(instances.lang.get(data.lang).display.config.error)],
          ephemeral: true
        })
      }
    }
  }

  public async commandLang(context: CommandContext) {
    if (!context.guildID || !context.member) return
    const member = await this.client.getRESTGuildMember(context.guildID, context.member.id)
    if (!member) return

    const data = await this.serverConfig.getOrCreate(member.guild.id)

    if (!member.permissions.has('manageMessages') && !instances.config.discord.admins.includes(member.id)) {
      await context.send({
        embeds: [this.genErrorMessage(instances.lang.get(data.lang).display.command.no_permission)],
        ephemeral: true
      })
      return
    }

    const guildId = member.guild.id
    const newLang = context.options.language.language as string

    switch (await this.voiceLog.text.setLang(guildId, newLang)) {
      case VoiceLogSetStatus.LangSuccess:
        await context.send({
          embeds: [this.genSuccessMessage(vsprintf(instances.lang.get(newLang).display.config.lang_success, [instances.lang.get(newLang).displayName]))]
        })
        return
      case VoiceLogSetStatus.MissingLang:
        await context.send({
          embeds: [this.genErrorMessage(ERR_MISSING_LANG)],
          ephemeral: true
        })
        return
      case VoiceLogSetStatus.NotChanged:
        await context.send({
          embeds: [this.genNotChangedMessage(vsprintf(instances.lang.get(data.lang).display.config.lang_exist, [instances.lang.get(data.lang).displayName]))],
          ephemeral: true
        })
        return
      default:
        await context.send({
          embeds: [this.genErrorMessage(instances.lang.get(data.lang).display.config.error)],
          ephemeral: true
        })
    }
  }

  public async commandUnsetVoiceLog(context: CommandContext) {
    if (!context.guildID || !context.member) return
    const member = await this.client.getRESTGuildMember(context.guildID, context.member.id)
    if (!member) return

    const data = await this.serverConfig.getOrCreate(member.guild.id)

    if (!member.permissions.has('manageMessages') && !instances.config.discord.admins.includes(member.id)) {
      await context.send({
        embeds: [this.genErrorMessage(instances.lang.get(data.lang).display.command.no_permission)],
        ephemeral: true
      })
      return
    }

    await this.voiceLog.text.unsetVoiceLog(member.guild.id)
    await context.send({
      embeds: [this.genSuccessMessage(instances.lang.get(data.lang).display.config.unset_success)]
    })
  }

  public async commandSetTTS(context: CommandContext) {
    if (!context.guildID || !context.member) return
    const member = await this.client.getRESTGuildMember(context.guildID, context.member.id)
    if (!member) return

    const data = await this.serverConfig.getOrCreate(member.guild.id)

    if (!member.permissions.has('manageMessages') && !instances.config.discord.admins.includes(member.id)) {
      await context.send({
        embeds: [this.genErrorMessage(instances.lang.get(data.lang).display.command.no_permission)],
        ephemeral: true
      })
      return
    }

    const options = context.options.tts as Partial<Record<string, unknown>>
    if (!options) {
      await context.send({
        embeds: [this.genErrorMessage('Please provide at least one option to change.')],
        ephemeral: true
      })
      return
    }

    const ttsConfig: Partial<IVoiceMessageTTS> = {}
    if (typeof options.enabled === 'boolean') ttsConfig.enabled = options.enabled
    if (typeof options.type === 'string') ttsConfig.type = options.type as VoiceMessageTTSType
    if (typeof options.message_lang === 'string') {
      if (!instances.lang.isExist(options.message_lang)) {
        await context.send({
          embeds: [this.genErrorMessage(ERR_MISSING_LANG)],
          ephemeral: true
        })
        return
      }
      ttsConfig.messageLang = options.message_lang
    }
    if (typeof options.voice_lang === 'string') ttsConfig.voiceLang = options.voice_lang
    if (typeof options.voice_name === 'string') ttsConfig.voiceName = options.voice_name

    try {
      const updated = await this.voiceLog.text.setVoiceMessageTTS(member.guild.id, ttsConfig)
      await context.send({
        embeds: [this.genTTSSuccessMessage(instances.lang.get(data.lang).display.config.tts_success, updated, data.lang)]
      })
    } catch (error) {
      this.logger.error('Failed to update TTS config', error)
      await context.send({
        embeds: [this.genErrorMessage(instances.lang.get(data.lang).display.config.error)],
        ephemeral: true
      })
    }
  }

  public async commandRefreshCache(context: CommandContext) {
    if (!context.guildID || !context.member) return
    const member = await this.client.getRESTGuildMember(context.guildID, context.member.id)
    if (!member) return

    const data = await this.serverConfig.getOrCreate(member.guild.id)

    if (!instances.config.discord.admins.includes(member.id)) {
      await context.send({
        embeds: [this.genErrorMessage(instances.lang.get(data.lang).display.command.no_permission)],
        ephemeral: true
      })
      return
    }

    this.voiceLog.voice.refreshCache(context)
  }

  private genSuccessMessage(msg: string) {
    return {
      title: 'Success',
      color: 4289797,
      description: msg
    } as MessageEmbedOptions
  }

  private genNotChangedMessage(msg: string) {
    return {
      title: 'Nothing Changed',
      color: 9274675,
      description: msg
    } as MessageEmbedOptions
  }

  private genErrorMessage(msg: string) {
    return {
      title: 'Error',
      color: 13632027,
      description: msg
    } as MessageEmbedOptions
  }

  private genTTSSuccessMessage(title: string, ttsConfig: IVoiceMessageTTS, lang: string) {
    const l = instances.lang.get(lang).display.config
    const translatedFields = [
      { label: l.tts_enabled, value: ttsConfig.enabled ? l.tts_yes : l.tts_no },
      { label: l.tts_message_lang, value: ttsConfig.messageLang },
      { label: l.tts_type, value: ttsConfig.type },
      { label: l.tts_voice_lang, value: ttsConfig.voiceLang },
      { label: l.tts_voice_name, value: ttsConfig.voiceName }
    ]
    const description = translatedFields.map((f) => `**${f.label}**: ${f.value}`).join('\n')
    return {
      title,
      color: 4289797,
      description
    } as MessageEmbedOptions
  }
}
