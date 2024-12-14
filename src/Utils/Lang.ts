import { existsSync, readFileSync } from 'fs'
import { ApplicationCommandOption, ApplicationCommandOptionChoice, CommandOptionType } from 'slash-create'
import { Logger, ILogObj } from 'tslog'

export class Lang {
  private lang: { [key: string]: { display: { [key: string]: { [key: string]: string } }, displayName: string } } = {}
  constructor(mainLogger: Logger<ILogObj>) {
    if (!existsSync('./langs')) {
      mainLogger.error('Directory langs/ not found. Try re-pulling source code.')
      process.exit(1)
    }
    if (!existsSync('./langs/list.json')) {
      mainLogger.error('Directory langs/list.json not found. Try re-pulling source code.')
      process.exit(1)
    }
    let listRaw: { [key: string]: { file: string, display_name: string } }
    try {
      listRaw = JSON.parse(readFileSync('./langs/list.json', { encoding: 'utf-8' }))
    } catch (error) {
      mainLogger.error(`Error when loading langs/list.json: ${error}`)
      process.exit(1)
    }
    for (const key of Object.keys(listRaw)) {
      try {
        this.lang[key] = {
          display: JSON.parse(readFileSync(listRaw[key].file, { encoding: 'utf-8' })),
          displayName: listRaw[key].display_name
        }
      } catch (error) {
        mainLogger.error(`Error when loading ${listRaw[key].file}: ${error}`)
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
