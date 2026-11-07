import { unlinkSync as deleteFile, readdirSync as readDir } from 'node:fs'
import { extname } from 'node:path'
import type { CommandContext, MessageEmbedOptions } from 'slash-create'
import type { ILogObj, Logger } from 'tslog'
import { instances } from '../App/App'
import { MEMBER_EVENTS, type TTSRequest } from '../Audio/Audio'
import { genProgressMessage } from './Embeds'

export class CacheRefresh {
  private updateLock = false
  private logger: Logger<ILogObj>
  constructor(logger: Logger<ILogObj>) {
    this.logger = logger
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
    try {
      await this.runRefreshCache(context)
    } catch (error) {
      // Callers (the midnight job, /refresh) do not await this, so never reject
      this.logger.error('Cache refresh failed:', error)
    } finally {
      // Released even when a step throws, or every later refresh would be skipped
      this.updateLock = false
    }
  }

  private async runRefreshCache(context: CommandContext | undefined) {
    this.logger.info('Starting cache refresh...')
    const title = '➡️ Refreshing Caches'
    let seekCounter = 0
    let seekFilename = ''
    let seekDone = false
    let seekField = {
      name: `${seekDone ? '✅' : '➡️'} Seeking for files ...${seekDone ? ' Done' : ''}`,
      value: `${seekDone || seekCounter === 0 ? '' : `Current ${seekFilename}, `} Seeked ${seekCounter} files. `
    }
    let progressMessage = genProgressMessage(title, [seekField])
    await context?.send({ embeds: [progressMessage] })
    let progressCount = 0
    let progressTotal = 0
    const ttsList: string[] = []
    const requests: TTSRequest[] = [...instances.audio.systemRequests()]
    progressTotal += 2
    const files = readDir('assets/')
    files.forEach((file) => {
      if (extname(file) === '.json') {
        seekCounter++
        seekFilename = file
        seekField = {
          name: `${seekDone ? '✅' : '➡️'} Seeking for files ...${seekDone ? ' Done' : ''}`,
          value: `${seekDone || seekCounter === 0 ? '' : `Current ${seekFilename}, `} Seeked ${seekCounter} files. `
        }
        const config = instances.audio.readMemberConfig(`assets/${file}`)
        if (!config) return
        for (const type of MEMBER_EVENTS) {
          const request = instances.audio.memberRequest(config, type)
          if (!request) continue
          progressTotal++
          requests.push(request)
        }
      }
    })
    seekDone = true
    seekField = {
      name: `${seekDone ? '✅' : '➡️'} Seeking for files ...${seekDone ? ' Done' : ''}`,
      value: `${seekDone || seekCounter === 0 ? '' : `Current ${seekFilename}, `} Seeked ${seekCounter} files. `
    }
    for (const request of requests) {
      progressCount++
      const description = `${request.text} in ${request.lang}${request.voice ? ` with voice ${request.voice}` : ''}`
      const progressField = {
        name: '➡️ Processing texts...',
        value: `(${progressCount}/${progressTotal}) ${description}`
      }
      progressMessage = genProgressMessage(title, [seekField, progressField])
      await context?.editOriginal({ embeds: [progressMessage] })
      const fileName = await instances.audio.synthesize(request)
      this.logger.info(`(${progressCount}/${progressTotal}) ${description} -> ${fileName}`)
      if (fileName !== null) ttsList.push(fileName)
      await new Promise((res) => setTimeout(res, 500))
    }
    const progressField = {
      name: '✅ Processing files... Done',
      value: `Processed ${progressTotal} texts.`
    }
    let cacheRemoveCount = 0
    let cacheField = {
      name: '➡️ Removing unused cache...',
      value: cacheRemoveCount === 0 ? 'Seeking...' : `Removed ${cacheRemoveCount} unused ${cacheRemoveCount === 1 ? 'cache' : 'caches'}.`
    }
    progressMessage = genProgressMessage(title, [seekField, progressField, cacheField])
    await context?.editOriginal({ embeds: [progressMessage] })
    const cacheFiles = readDir('caches/')
    for (const file of cacheFiles) {
      if (!ttsList.includes(`./caches/${file}`) && instances.audio.isCacheFileRemovable(`./caches/${file}`)) {
        try {
          deleteFile(`./caches/${file}`)
        } catch (error) {
          this.logger.warn(`Failed to delete ./caches/${file}:`, error)
          continue
        }
        this.logger.info(`Deleted unused file ./caches/${file}`)
        cacheRemoveCount++
        progressMessage = genProgressMessage(title, [seekField, progressField, cacheField])
        await context?.editOriginal({ embeds: [progressMessage] })
      }
    }
    cacheField = {
      name: '✅ Removing unused cache... Done',
      value: cacheRemoveCount === 0 ? 'No unused caches found.' : `Removed ${cacheRemoveCount} unused ${cacheRemoveCount === 1 ? 'cache' : 'caches'}.`
    }
    progressMessage = genProgressMessage('✅ Refresh Caches Done', [seekField, progressField, cacheField], true)
    await context?.editOriginal({ embeds: [progressMessage] })
  }
}
