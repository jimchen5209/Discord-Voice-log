import { type ApplicationCommandOption, type ApplicationCommandOptionChoice, CommandOptionType } from 'slash-create'
import type { Lang } from '../../Shared/Lang'

export function genChoice(lang: Lang): ApplicationCommandOptionChoice[] {
  const choice: ApplicationCommandOptionChoice[] = []

  for (const [key, value] of lang.entries()) {
    if (!value) continue

    choice.push({
      name: value.displayName,
      value: key
    })
  }

  return choice
}

export function genOptions(lang: Lang, required: boolean): ApplicationCommandOption[] {
  const options: ApplicationCommandOption[] = [
    {
      name: 'language',
      description: 'VoiceLog Language',
      required: required,
      choices: genChoice(lang),
      type: CommandOptionType.STRING
    }
  ]

  return options
}
