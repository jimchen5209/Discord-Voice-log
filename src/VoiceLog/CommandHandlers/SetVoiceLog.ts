import type { CommandContext } from 'slash-create'
import { vsprintf } from 'sprintf-js'
import { genErrorMessage, genNotChangedMessage, genSuccessMessage } from '../Embeds'
import { VoiceLogSetStatus } from '../Text'
import { beginCommand, type CommandDeps } from './Guard'

const ERR_MISSING_LANG_DEFAULT = 'Language not exist, will not change your language.'

export async function commandSetVoiceLog(deps: CommandDeps, context: CommandContext) {
  const begun = await beginCommand(deps, context, 'manageMessages')
  if (!begun) return
  const { member, data } = begun

  const guildId = member.guild.id
  const channelId = context.channelID

  if (!context.options.set.language) {
    try {
      switch (await deps.voiceLog.text.setVoiceLog(guildId, channelId)) {
        case VoiceLogSetStatus.NotChanged:
          await context.send({
            embeds: [genNotChangedMessage(deps.lang.get(data.lang).display.config.exist)],
            ephemeral: true
          })
          return
        case VoiceLogSetStatus.ChannelSuccess:
          await context.send({
            embeds: [genSuccessMessage(deps.lang.get(data.lang).display.config.success)]
          })
      }
    } catch {
      await context.send({
        embeds: [genErrorMessage(deps.lang.get(data.lang).display.config.error)],
        ephemeral: true
      })
    }
  } else {
    const newLang = context.options.set.language as string

    try {
      switch (await deps.voiceLog.text.setVoiceLog(guildId, channelId, newLang)) {
        case VoiceLogSetStatus.AllSuccess:
          await context.send({
            embeds: [
              genSuccessMessage(vsprintf(deps.lang.get(newLang).display.config.lang_success, [deps.lang.get(newLang).displayName])),
              genSuccessMessage(deps.lang.get(newLang).display.config.success)
            ]
          })
          return
        case VoiceLogSetStatus.ChannelSuccess:
          await context.send({
            embeds: [genNotChangedMessage(vsprintf(deps.lang.get(data.lang).display.config.lang_exist, [deps.lang.get(data.lang).displayName]))],
            ephemeral: true
          })
          await context.send({
            embeds: [genSuccessMessage(deps.lang.get(data.lang).display.config.success)]
          })
          return
        case VoiceLogSetStatus.ChannelSuccessMissingLang:
          await context.send({
            embeds: [genErrorMessage(ERR_MISSING_LANG_DEFAULT)],
            ephemeral: true
          })
          await context.send({
            embeds: [genSuccessMessage(deps.lang.get(data.lang).display.config.success)]
          })
          return
        case VoiceLogSetStatus.LangSuccess:
          await context.send({
            embeds: [genSuccessMessage(vsprintf(deps.lang.get(newLang).display.config.lang_success, [deps.lang.get(newLang).displayName]))]
          })
          await context.send({
            embeds: [genNotChangedMessage(deps.lang.get(newLang).display.config.exist)],
            ephemeral: true
          })
          return
        case VoiceLogSetStatus.MissingLang:
          await context.send({
            embeds: [genErrorMessage(ERR_MISSING_LANG_DEFAULT), genNotChangedMessage(deps.lang.get(data.lang).display.config.exist)],
            ephemeral: true
          })
          return
        case VoiceLogSetStatus.NotChanged:
          await context.send({
            embeds: [
              genNotChangedMessage(vsprintf(deps.lang.get(data.lang).display.config.lang_exist, [deps.lang.get(data.lang).displayName])),
              genNotChangedMessage(deps.lang.get(data.lang).display.config.exist)
            ],
            ephemeral: true
          })
      }
    } catch {
      await context.send({
        embeds: [genErrorMessage(deps.lang.get(data.lang).display.config.error)],
        ephemeral: true
      })
    }
  }
}
