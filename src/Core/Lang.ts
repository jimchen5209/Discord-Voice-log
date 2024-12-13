import fs from 'fs'
import { resolve } from 'path'
import { ApplicationCommandOption, ApplicationCommandOptionChoice, CommandOptionType } from 'slash-create'
import { Core } from '..'

export class Lang {
  private lang: { [key: string]: { display: { [key: string]: { [key: string]: string } }, displayName: string } } = {}
  constructor(core: Core) {
    if (!fs.existsSync('./langs')) {
      core.mainLogger.error('Directory langs/ not found. Try re-pulling source code.')
      process.exit(1)
    }
    if (!fs.existsSync('./langs/list.json')) {
      core.mainLogger.error('Directory langs/list.json not found. Try re-pulling source code.')
      process.exit(1)
    }
    let listRaw: { [key: string]: { file: string, display_name: string } }
    try {
      listRaw = require(resolve('./langs/list.json'))
    } catch (error) {
      core.mainLogger.error(`Error when loading langs/list.json: ${error}`)
      process.exit(1)
    }
    for (const key of Object.keys(listRaw)) {
      try {
        this.lang[key] = {
          display: require(resolve(listRaw[key].file)),
          displayName: listRaw[key].display_name
        }
      } catch (error) {
        core.mainLogger.error(`Error when loading ${listRaw[key].file}: ${error}`)
      }
    }
  }
  public get(lang: string) {
    if (lang in this.lang) {
      return this.lang[lang]
    }
    return this.lang.en_US

  }

  public isExist(lang: string) { return (lang in this.lang) }

  public genOptions(required: boolean) {
    const choice: ApplicationCommandOptionChoice[] = []

    for (const key of Object.keys(this.lang)) {
      if (!this.lang[key]) continue

      choice.push({
        name: this.lang[key].displayName,
        value: key
      })
    }

    const options: ApplicationCommandOption[] = [{
      name: 'language',
      description: 'VoiceLog Language',
      required: required,
      choices: choice,
      type: CommandOptionType.STRING
    }]

    return options
  }
}
