import { Client, TextChannel } from 'eris'
import { ILogObj, Logger } from 'tslog'
import { Core } from '../../..'

export class DiscordText {
  private bot: Client
  private logger: Logger<ILogObj>

  constructor(_core: Core, bot: Client, logger: Logger<ILogObj>) {
    this.bot = bot
    this.logger = logger.getSubLogger({ name: 'Discord/Text'})

    this.bot.on('messageCreate', msg => {

      if (!msg.member) {
        return
      }

      const channelName = ((msg.channel) as TextChannel).name
      const channelID = msg.channel.id

      const userNick = (msg.member.nick) ? msg.member.nick : ''
      const userName = msg.member.user.username
      const userID = msg.member.user.id

      const messageContent = msg.content
      // const message = `${msg.author.username : ${(msg.content)}`;
      messageContent.split('\n').forEach(content => {
        this.logger.info(`${userNick}[${userName}, ${userID}] => ${channelName} (${channelID}): ${content}`)
      })
      if (msg.attachments.length !== 0) {
        msg.attachments.forEach(attachments => {
          this.logger.info(`Attachment: ${attachments.url}`)
        })
      }
    })
  }
}
