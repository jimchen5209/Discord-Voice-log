import waitUntil from 'async-wait-until'
import { VoiceChannel } from 'eris'
import { readdirSync as readDir, readFileSync as readFile, unlinkSync as deleteFile } from 'fs'
import { ILogObj, Logger } from 'tslog'
import { extname } from 'path'
import Queue from 'promise-queue'
import { CommandContext, MessageEmbedOptions } from 'slash-create'
import { DbServerConfigManager } from '../../../MongoDB/db/ServerConfig'
import { Discord } from '../../Core'
import { DiscordVoice } from '../../Core/Voice'
import { VoiceLog } from '../VoiceLog'
import { instances } from '../../../../Utils/Instances'

export class VoiceLogVoice {
  private updateLock = false
  private discord: Discord
  private audios: { [key: string]: DiscordVoice } = {}
  private logger: Logger<ILogObj>
  private serverConfig: DbServerConfigManager

  constructor(voiceLog: VoiceLog, discord: Discord) {
    this.discord = discord
    this.logger = voiceLog.logger.getSubLogger({ name: 'Voice' })
    this.serverConfig = voiceLog.serverConfig
  }

  public getCurrentVoice(guildId: string): DiscordVoice | undefined {
    const voice = this.audios[guildId]
    if (!voice) {
      const botVoice = this.discord.client.voiceConnections.get(guildId)
      if (botVoice && botVoice.ready) {
        if (botVoice.channelID) this.audios[guildId] = new DiscordVoice(this.discord, botVoice.channelID, botVoice)
        return this.audios[guildId]
      }
      return undefined
    } else if (!voice.isReady()) {
      this.destroy(guildId)
      return undefined
    }

    return this.audios[guildId]
  }

  public async join(guildId: string, channelId: string, updateDatabase = false, playJoin = false): Promise<DiscordVoice | undefined> {
    if (this.audios[guildId]) {
      if (!this.audios[guildId].isReady() && !this.audios[guildId].init) {
        this.destroy(guildId)
      } else if (this.audios[guildId].channelId !== channelId) {
        this.audios[guildId].switchChannel(channelId)

        if (updateDatabase) {
          this.serverConfig.updateLastVoiceChannel(guildId, '')
          this.serverConfig.updateCurrentVoiceChannel(guildId, channelId)
        }

        if (playJoin) this.audios[guildId].playMoved()
        return this.audios[guildId]
      } else {
        return this.audios[guildId]
      }
    }

    this.audios[guildId] = new DiscordVoice(this.discord, channelId)
    try {
      await waitUntil(() => this.audios[guildId] && this.audios[guildId].isReady())
    } catch (error) {
      this.logger.error('Voice timed out:', error)
      return
    }
    if (updateDatabase) {
      this.serverConfig.updateLastVoiceChannel(guildId, '')
      this.serverConfig.updateCurrentVoiceChannel(guildId, channelId)
    }

    if (playJoin) this.audios[guildId].playReady()

    return this.audios[guildId]
  }

  public async destroy(guildId: string, updateDatabase = false) {
    this.audios[guildId].destroy()
    delete this.audios[guildId]
    if (updateDatabase) {
      this.serverConfig.updateLastVoiceChannel(guildId, '')
      this.serverConfig.updateCurrentVoiceChannel(guildId, '')
    }
  }

  private async sleep(guildId: string, channelId: string) {
    this.logger.info(`No user in ${channelId}, sleeping...`)
    this.destroy(guildId)
    this.serverConfig.updateLastVoiceChannel(guildId, channelId)
    this.serverConfig.updateCurrentVoiceChannel(guildId, '')
  }

  public async end() {
    for (const guildId in this.audios) {
      this.destroy(guildId)
    }
  }

  public async refreshCache(context: CommandContext | undefined) {
    if (this.updateLock) {
      await context?.send({
        embeds: [
          {
            title: 'Operation skipped',
            color: 13632027,
            description: 'Currently refreshing in progress...'
          } as MessageEmbedOptions
        ],
        ephemeral: true
      })

      return
    }
    this.updateLock = true
    this.logger.info('Starting cache refresh...')
    const title = '➡️ Refreshing Caches'
    let seekCounter = 0
    let seekFilename = ''
    let seekDone = false
    let seekField = {
      name: `${seekDone ? '✅' : '➡️'} Seeking for files ...${seekDone ? ' Done' : ''}`,
      value: `${seekDone || seekCounter === 0 ? '' : `Current ${seekFilename}, `} Seeked ${seekCounter} files. `
    }
    let progressMessage = this.genProgressMessage(title, [seekField])
    await context?.send({ embeds: [progressMessage] })
    let progressCount = 0
    let progressTotal = 0
    const queue = new Queue(1, Infinity)
    const getTTS = (text: string, lang: string) => {
      // eslint-disable-next-line no-async-promise-executor
      return new Promise<void>(async (res) => {
        progressCount++
        const progressField = {
          name: '➡️ Processing texts...',
          value: `(${progressCount}/${progressTotal}) ${text} in ${lang}`
        }
        progressMessage = this.genProgressMessage(title, [seekField, progressField])
        await context?.editOriginal({ embeds: [progressMessage] })
        instances.ttsHelper.getTTSFile(text, lang).then((fileName) => {
          this.logger.info(`(${progressCount}/${progressTotal}) ${text} in ${lang} -> ${fileName}`)
          if (fileName !== null) ttsList.push(fileName)
          setTimeout(() => {
            res()
          }, 500)
        })
      })
    }
    const getWaveTTS = (text: string, lang: string, voice: string) => {
      // eslint-disable-next-line no-async-promise-executor
      return new Promise<void>(async (res) => {
        progressCount++
        const progressField = {
          name: '➡️ Processing texts...',
          value: `(${progressCount}/${progressTotal}) ${text} in ${lang} with voice ${voice}`
        }
        progressMessage = this.genProgressMessage(title, [seekField, progressField])
        await context?.editOriginal({ embeds: [progressMessage] })
        instances.ttsHelper.getWaveTTS(text, lang, voice).then((fileName) => {
          this.logger.info(`(${progressCount}/${progressTotal}) ${text} in ${lang} with voice ${voice} -> ${fileName}`)
          if (fileName !== null) ttsList.push(fileName)
          setTimeout(() => {
            res()
          }, 500)
        })
      })
    }
    const ttsList: string[] = []
    queue.add(() => getWaveTTS('VoiceLog is moved to your channel.', 'en-US', 'en-US-Wavenet-D'))
    queue.add(() => getWaveTTS('VoiceLog is ready.', 'en-US', 'en-US-Wavenet-D'))
    progressTotal += 2
    const typeList = ['join', 'left', 'switched_out', 'switched_in']
    const files = readDir('assets/')
    files.forEach((file) => {
      if (extname(file) === '.json') {
        seekCounter++
        seekFilename = file
        seekField = {
          name: `${seekDone ? '✅' : '➡️'} Seeking for files ...${seekDone ? ' Done' : ''}`,
          value: `${seekDone || seekCounter === 0 ? '' : `Current ${seekFilename}, `} Seeked ${seekCounter} files. `
        }
        const tts = JSON.parse(readFile(`assets/${file}`, { encoding: 'utf-8' }))
        if (tts.use_wave_tts && tts.lang && tts.voice) {
          typeList.forEach((type) => {
            if (tts[type]) {
              progressTotal++
              queue.add(() => getWaveTTS(tts[type], tts.lang, tts.voice))
            }
          })
        } else if (tts.lang) {
          typeList.forEach((type) => {
            if (tts[type]) {
              progressTotal++
              queue.add(() => getTTS(tts[type], tts.lang))
            }
          })
        }
      }
    })
    seekDone = true
    seekField = {
      name: `${seekDone ? '✅' : '➡️'} Seeking for files ...${seekDone ? ' Done' : ''}`,
      value: `${seekDone || seekCounter === 0 ? '' : `Current ${seekFilename}, `} Seeked ${seekCounter} files. `
    }
    const afterWork = () => {
      // eslint-disable-next-line no-async-promise-executor
      return new Promise<void>(async (res) => {
        const progressField = {
          name: '✅ Processing files... Done',
          value: `Processed ${progressTotal} texts.`
        }
        let cacheRemoveCount = 0
        let cacheField = {
          name: '➡️ Removing unused cache...',
          value: cacheRemoveCount === 0 ? 'Seeking...' : `Removed ${cacheRemoveCount} unused ${cacheRemoveCount === 1 ? 'cache' : 'caches'}.`
        }
        progressMessage = this.genProgressMessage(title, [seekField, progressField, cacheField])
        await context?.editOriginal({ embeds: [progressMessage] })
        const cacheFiles = readDir('caches/')
        cacheFiles.forEach(async (file) => {
          if (!ttsList.includes(`./caches/${file}`)) {
            deleteFile(`./caches/${file}`)
            this.logger.info(`Deleted unused file ./caches/${file}`)
            cacheRemoveCount++
            progressMessage = this.genProgressMessage(title, [seekField, progressField, cacheField])
            await context?.editOriginal({ embeds: [progressMessage] })
          }
        })
        cacheField = {
          name: '✅ Removing unused cache... Done',
          value: cacheRemoveCount === 0 ? 'No unused caches found.' : `Removed ${cacheRemoveCount} unused ${cacheRemoveCount === 1 ? 'cache' : 'caches'}.`
        }
        progressMessage = this.genProgressMessage('✅ Refresh Caches Done', [seekField, progressField, cacheField], true)
        await context?.editOriginal({ embeds: [progressMessage] })
        this.updateLock = false
        res()
      })
    }
    queue.add(() => afterWork())
  }

  private genProgressMessage(title: string, fields: Array<{ name: string; value: string }>, isDone = false) {
    return {
      color: isDone ? 4289797 : 16312092,
      title,
      fields
    } as MessageEmbedOptions
  }

  public async autoLeaveChannel(oldChannel: VoiceChannel | undefined, newChannel: VoiceChannel | undefined, guildId: string): Promise<string | undefined> {
    let channelToCheck: VoiceChannel | undefined

    const voice = this.getCurrentVoice(guildId)
    const data = await this.serverConfig.get(guildId)

    if (voice?.isReady()) {
      channelToCheck = oldChannel?.id === voice?.channelId ? oldChannel : newChannel?.id === voice?.channelId ? newChannel : undefined
    } else if (data) {
      channelToCheck = oldChannel?.id === data.lastVoiceChannel ? oldChannel : newChannel?.id === data.lastVoiceChannel ? newChannel : undefined
    }

    if (!channelToCheck) return

    let noUser = true

    channelToCheck.voiceMembers?.forEach((user) => {
      if (!user.bot) {
        noUser = false
      }
    })

    if (noUser) {
      if (voice) {
        await this.sleep(guildId, channelToCheck.id)
      }
    } else {
      let connection = await this.join(guildId, channelToCheck.id, true)
      for (let i = 0; i < 5; ++i) {
        if (!connection) {
          this.logger.warn(`Auto reconnect failed, retrying (${i + 1} / 5)...`)
          await this.destroy(guildId)
          connection = await this.join(guildId, channelToCheck.id, true)
        } else {
          return channelToCheck.id
        }
      }

      this.logger.error('Auto reconnect fails after 5 tries')
    }
  }
}
