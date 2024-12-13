import waitUntil from 'async-wait-until'
import { Client } from 'eris'
import { CommandContext, MessageEmbedOptions } from 'slash-create'
import { vsprintf } from 'sprintf-js'
import { ILogObj, Logger } from 'tslog'
import { Config } from '../../../Config'
import { Lang } from '../../../Lang'
import { DbServerConfigManager } from '../../../MongoDB/db/ServerConfig'
import { Discord } from '../../Core'
import { VoiceLog } from '../VoiceLog'
import { VoiceLogSetStatus } from './Text'
import { instances } from '../../../../Utils/Instances'

const ERR_MISSING_LANG = 'Language not exist.'
const ERR_MISSING_LANG_DEFAULT = 'Language not exist, will not change your language.'

export class VoiceLogCommands {
  private client: Client
  private voiceLog: VoiceLog
  private logger: Logger<ILogObj>
  private config: Config
  private data: DbServerConfigManager
  private lang: Lang

  constructor(voiceLog: VoiceLog, discord: Discord, logger: Logger<ILogObj>) {
    this.config = instances.config
    this.data = voiceLog.serverConfig
    this.logger = logger.getSubLogger({ name: 'Voice' })
    this.lang = instances.lang
    this.voiceLog = voiceLog
    this.client = discord.client
  }

  public async commandJoin(context: CommandContext) {
    if (!context.guildID || !context.member) return
    const member = await this.client.getRESTGuildMember(context.guildID, context.member.id)
    if (!member) return

    const data = await this.data.getOrCreate(member.guild.id)

    if (!(member.permissions.has('manageMessages')) && !(this.config.discord.admins.includes(member.id))) {
      await context.send({
        embeds: [this.genErrorMessage(this.lang.get(data.lang).display.command.no_permission)],
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
          embeds: [this.genNotChangedMessage(this.lang.get(data.lang).display.command.already_connected)],
          ephemeral: true
        })
      } else {
        const newVoice = await this.voiceLog.voice.join(guildId, channelID, true, true)
        try {
          await waitUntil(() => newVoice?.isReady())
        } catch (error) {
          this.logger.error('Voice timed out', error)
          await context.send({
            embeds: [this.genErrorMessage(this.lang.get(data.lang).display.command.error)],
            ephemeral: true
          })
          return
        }
        await context.send({
          embeds: [this.genSuccessMessage(this.lang.get(data.lang).display.command.join_success)]
        })
      }
    } else {
      await context.send({
        embeds: [this.genErrorMessage(this.lang.get(data.lang).display.command.not_in_channel)],
        ephemeral: true
      })
    }
  }

  public async commandLeave(context: CommandContext) {
    if (!context.guildID || !context.member) return
    const member = await this.client.getRESTGuildMember(context.guildID, context.member.id)
    if (!member) return

    const data = await this.data.getOrCreate(member.guild.id)

    if (!(member.permissions.has('manageMessages')) && !(this.config.discord.admins.includes(member.id))) {
      await context.send({
        embeds: [this.genErrorMessage(this.lang.get(data.lang).display.command.no_permission)],
        ephemeral: true
      })
      return
    }
    const guildId = member.guild.id

    const voice = this.voiceLog.voice.getCurrentVoice(guildId)

    if (voice) {
      await this.voiceLog.voice.destroy(guildId, true)
      await context.send({
        embeds: [this.genSuccessMessage(this.lang.get(data.lang).display.command.leave_success)]
      })
    } else {
      await context.send({
        embeds: [this.genNotChangedMessage(this.lang.get(data.lang).display.command.bot_not_connected)],
        ephemeral: true
      })
    }
  }

  public async commandSetVoiceLog(context: CommandContext) {
    if (!context.guildID || !context.member) return
    const member = await this.client.getRESTGuildMember(context.guildID, context.member.id)
    if (!member) return

    const data = await this.data.getOrCreate(member.guild.id)

    if (!(member.permissions.has('manageMessages')) && !(this.config.discord.admins.includes(member.id))) {
      await context.send({
        embeds: [this.genErrorMessage(this.lang.get(data.lang).display.command.no_permission)],
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
              embeds: [this.genNotChangedMessage(this.lang.get(data.lang).display.config.exist)],
              ephemeral: true
            })
            return
          case VoiceLogSetStatus.ChannelSuccess:
            await context.send({
              embeds: [this.genSuccessMessage(this.lang.get(data.lang).display.config.success)]
            })

        }
      } catch {
        await context.send({
          embeds: [this.genErrorMessage(this.lang.get(data.lang).display.config.error)],
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
                this.genSuccessMessage(vsprintf(this.lang.get(newLang).display.config.lang_success, [this.lang.get(newLang).displayName])),
                this.genSuccessMessage(this.lang.get(newLang).display.config.success)
              ]
            })
            return
          case VoiceLogSetStatus.ChannelSuccess:
            await context.send({
              embeds: [this.genNotChangedMessage(vsprintf(this.lang.get(data.lang).display.config.lang_exist, [this.lang.get(data.lang).displayName]))],
              ephemeral : true
            })
            await context.send({
              embeds: [this.genSuccessMessage(this.lang.get(data.lang).display.config.success)]
            })
            return
          case VoiceLogSetStatus.ChannelSuccess_MissingLang:
            await context.send({
              embeds: [this.genErrorMessage(ERR_MISSING_LANG_DEFAULT)],
              ephemeral: true
            })
            await context.send({
              embeds: [this.genSuccessMessage(this.lang.get(data.lang).display.config.success)]
            })
            return
          case VoiceLogSetStatus.LangSuccess:
            await context.send({
              embeds: [this.genSuccessMessage(vsprintf(this.lang.get(newLang).display.config.lang_success, [this.lang.get(newLang).displayName]))]
            })
            await context.send({
              embeds: [this.genNotChangedMessage(this.lang.get(newLang).display.config.exist)],
              ephemeral: true
            })
            return
          case VoiceLogSetStatus.MissingLang:
            await context.send({
              embeds: [
                this.genErrorMessage(ERR_MISSING_LANG_DEFAULT),
                this.genNotChangedMessage(this.lang.get(data.lang).display.config.exist)
              ],
              ephemeral: true
            })
            return
          case VoiceLogSetStatus.NotChanged:
            await context.send({
              embeds: [
                this.genNotChangedMessage(vsprintf(this.lang.get(data.lang).display.config.lang_exist, [this.lang.get(data.lang).displayName])),
                this.genNotChangedMessage(this.lang.get(data.lang).display.config.exist)
              ],
              ephemeral: true
            })

        }
      } catch {
        await context.send({
          embeds: [this.genErrorMessage(this.lang.get(data.lang).display.config.error)],
          ephemeral: true
        })
      }
    }
  }

  public async commandLang(context: CommandContext) {
    if (!context.guildID || !context.member) return
    const member = await this.client.getRESTGuildMember(context.guildID, context.member.id)
    if (!member) return

    const data = await this.data.getOrCreate(member.guild.id)

    if (!(member.permissions.has('manageMessages')) && !(this.config.discord.admins.includes(member.id))) {
      await context.send({
        embeds: [this.genErrorMessage(this.lang.get(data.lang).display.command.no_permission)],
        ephemeral: true
      })
      return
    }

    const guildId = member.guild.id
    const newLang = context.options.language.language as string

    switch (await this.voiceLog.text.setLang(guildId, newLang)) {
      case VoiceLogSetStatus.LangSuccess:
        await context.send({
          embeds: [this.genSuccessMessage(vsprintf(this.lang.get(newLang).display.config.lang_success, [this.lang.get(newLang).displayName]))]
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
          embeds: [this.genNotChangedMessage(vsprintf(this.lang.get(data.lang).display.config.lang_exist, [this.lang.get(data.lang).displayName]))],
          ephemeral: true
        })
        return
      default:
        await context.send({
          embeds: [this.genErrorMessage(this.lang.get(data.lang).display.config.error)],
          ephemeral: true
        })

    }
  }

  public async commandUnsetVoiceLog(context: CommandContext) {
    if (!context.guildID || !context.member) return
    const member = await this.client.getRESTGuildMember(context.guildID, context.member.id)
    if (!member) return

    const data = await this.data.getOrCreate(member.guild.id)

    if (!(member.permissions.has('manageMessages')) && !(this.config.discord.admins.includes(member.id))) {
      await context.send({
        embeds: [this.genErrorMessage(this.lang.get(data.lang).display.command.no_permission)],
        ephemeral: true
      })
      return
    }

    await this.voiceLog.text.unsetVoiceLog(member.guild.id)
    await context.send({
      embeds: [this.genSuccessMessage(this.lang.get(data.lang).display.config.unset_success)]
    })
  }

  public async commandRefreshCache(context: CommandContext) {
    if (!context.guildID || !context.member) return
    const member = await this.client.getRESTGuildMember(context.guildID, context.member.id)
    if (!member) return

    const data = await this.data.getOrCreate(member.guild.id)

    if (!(this.config.discord.admins.includes(member.id))) {
      await context.send({
        embeds: [this.genErrorMessage(this.lang.get(data.lang).display.command.no_permission)],
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
}
