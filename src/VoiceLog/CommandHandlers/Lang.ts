import type { CommandContext } from 'slash-create'
import { vsprintf } from 'sprintf-js'
import { genErrorMessage, genNotChangedMessage, genSuccessMessage } from '../Embeds'
import { VoiceLogSetStatus } from '../Text'
import { beginCommand, type CommandDeps } from './Guard'

const ERR_MISSING_LANG = 'Language not exist.'

export async function commandLang(deps: CommandDeps, context: CommandContext) {
  const begun = await beginCommand(deps, context, 'manageMessages')
  if (!begun) return
  const { member, data } = begun

  const guildId = member.guild.id
  const newLang = context.options.language.language as string

  switch (await deps.voiceLog.text.setLang(guildId, newLang)) {
    case VoiceLogSetStatus.LangSuccess:
      await context.send({
        embeds: [genSuccessMessage(vsprintf(deps.lang.get(newLang).display.config.lang_success, [deps.lang.get(newLang).displayName]))]
      })
      return
    case VoiceLogSetStatus.MissingLang:
      await context.send({
        embeds: [genErrorMessage(ERR_MISSING_LANG)],
        ephemeral: true
      })
      return
    case VoiceLogSetStatus.NotChanged:
      await context.send({
        embeds: [genNotChangedMessage(vsprintf(deps.lang.get(data.lang).display.config.lang_exist, [deps.lang.get(data.lang).displayName]))],
        ephemeral: true
      })
      return
    default:
      await context.send({
        embeds: [genErrorMessage(deps.lang.get(data.lang).display.config.error)],
        ephemeral: true
      })
  }
}
