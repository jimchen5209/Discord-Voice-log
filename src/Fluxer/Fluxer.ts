import { Client, Events, type Guild, GuildMember, type Message, PermissionFlags, Routes, type Logger as SdkLogger } from '@fluxerjs/core'
import type { ILogObj, Logger } from 'tslog'
import type { FluxerInstanceConfig } from '../Config/Types'
import type { CommandReply, CommandRequest } from '../Platform/Command'
import type { PlatformRuntime } from '../Platform/Runtime'
import type { GuildKey, PlatformScope } from '../Platform/Scope'
import type { MemberView, MessageView, VoicePresenceChange } from '../Platform/Views'
import type { Lang } from '../Shared/Lang'
import { discoverInstance, isTrustedEndpoint } from './Discovery'
import { fluxerGuild, toChannelView, toFluxerEmbed, toMemberView, toMessageView } from './Mapping'
import { genHelpEmbed, isCommand, parseCommand } from './MentionCommand'
import { type PresenceDelta, VoicePresenceTracker, type VoiceStateUpdate } from './Presence'
import { FluxerTextOutput } from './TextOutput'

// Events the bot never uses, so Fluxer does not send them
const IGNORED_EVENTS = ['TYPING_START', 'MESSAGE_REACTION_ADD', 'MESSAGE_REACTION_REMOVE']

// The voice state fields this runtime reads, as sent by the gateway
interface WireVoiceState {
  // biome-ignore lint/style/useNamingConvention: Fluxer field name
  guild_id?: string | null
  // biome-ignore lint/style/useNamingConvention: Fluxer field name
  channel_id: string | null
  // biome-ignore lint/style/useNamingConvention: Fluxer field name
  user_id: string
  // biome-ignore lint/style/useNamingConvention: Fluxer field name
  connection_id?: string | null
  version?: number
  // The participant's member object, with its user; only the fields resolveMember checks are listed
  member?: { user?: { username?: string } } | null
}

type GuildMemberData = ConstructorParameters<typeof GuildMember>[1]

function toUpdate(guildId: string, state: WireVoiceState): VoiceStateUpdate | undefined {
  // Without a connection id the update cannot be told apart from the user's other connections
  if (!state.user_id || !state.connection_id) return undefined
  return { guildId, userId: state.user_id, connectionId: state.connection_id, channelId: state.channel_id ?? null, version: state.version }
}

// Warnings and errors of the SDK go to this runtime's log
function sdkLogger(logger: Logger<ILogObj>): SdkLogger {
  const withFields = (fields: object | undefined) => (fields ? [fields] : [])
  return {
    level: 'warn',
    error: (message, fields) => logger.error(message, ...withFields(fields)),
    warn: (message, fields) => logger.warn(message, ...withFields(fields)),
    info: (message, fields) => logger.info(message, ...withFields(fields)),
    debug: (message, fields) => logger.debug(message, ...withFields(fields)),
    child: () => sdkLogger(logger)
  }
}

// The SDK fetches /gateway/bot on every connect and reconnect and sends the token in IDENTIFY to the URL it gets.
// Each answer is checked where the SDK reads it; isRetryable: false makes the SDK give up instead of retrying.
function guardGateway(client: Client, origin: string) {
  const rest = client.rest
  const get = rest.get.bind(rest)
  rest.get = (async (route: string, options?: Parameters<typeof get>[1]) => {
    const result = await get(route, options)
    if (route.split('?')[0] === Routes.gatewayBot()) {
      const url = (result as { url?: unknown } | null)?.url
      if (typeof url !== 'string' || !isTrustedEndpoint(url, origin, 'wss:')) {
        throw Object.assign(new Error(`Gateway ${JSON.stringify(url)} must be a wss:// URL on ${new URL(origin).hostname} or a subdomain`), {
          isRetryable: false
        })
      }
    }
    return result
  }) as typeof rest.get
}

// One Fluxer instance, official or self-hosted. Text only: no voice playback yet, so voice is undefined.
export class Fluxer implements PlatformRuntime {
  public readonly scope: PlatformScope
  public readonly logger: Logger<ILogObj>
  public readonly text: FluxerTextOutput
  public readonly voice = undefined
  private instance: FluxerInstanceConfig
  private lang: Lang
  private ttsProviderIds: string[]
  private client: Client | undefined
  private tracker = new VoicePresenceTracker()
  // Voice changes are reported in the order they happened, though members may have to be fetched
  private presenceQueue: Promise<void> = Promise.resolve()
  // Set while a Guild Create carrying voice states is handled, see listen()
  private syncedGuildId: string | undefined
  private ready = false
  private readyHandlers: (() => void)[] = []
  private messageHandler: ((message: MessageView) => void) | undefined
  private presenceHandler: ((change: VoicePresenceChange) => void) | undefined
  private commandHandler: ((request: CommandRequest) => Promise<void>) | undefined

  // lang and ttsProviderIds are listed in the help reply
  constructor(instance: FluxerInstanceConfig, mainLogger: Logger<ILogObj>, lang: Lang, ttsProviderIds: string[]) {
    this.instance = instance
    this.scope = { platform: 'fluxer', instanceId: instance.id }
    this.logger = mainLogger.getSubLogger({ name: `Fluxer:${instance.id}` })
    this.lang = lang
    this.ttsProviderIds = ttsProviderIds
    this.text = new FluxerTextOutput(() => this.client, this.logger)
  }

  public selfUserId() {
    return this.client?.user?.id ?? ''
  }

  public onReady(handler: () => void) {
    this.readyHandlers.push(handler)
  }

  public onMessage(handler: (message: MessageView) => void) {
    this.messageHandler = handler
  }

  public onVoicePresence(handler: (change: VoicePresenceChange) => void) {
    this.presenceHandler = handler
  }

  public onCommand(handler: (request: CommandRequest) => Promise<void>) {
    this.commandHandler = handler
  }

  // Discovery, then login. The token only goes to the API and gateway under the configured origin, see guardGateway.
  public async start() {
    const origin = this.instance.origin
    const endpoints = await discoverInstance(origin)
    this.logger.info(`Instance ${origin}: API ${endpoints.apiPublic}, api_code_version ${endpoints.apiCodeVersion}`)
    if (endpoints.apiCodeVersion !== 1) this.logger.warn(`api_code_version ${endpoints.apiCodeVersion} is untested; this version was written for 1`)
    if (endpoints.voiceEnabled) this.logger.info('The instance has voice, but this version only supports text on Fluxer')

    const client = new Client({
      // biome-ignore lint/style/useNamingConvention: Fluxer field name
      instance: { api: endpoints.apiPublic, api_public: endpoints.apiPublic, ...(endpoints.media ? { media: endpoints.media } : {}) },
      suppressIntentWarning: true,
      ignoredEvents: IGNORED_EVENTS,
      // Ready after every guild's snapshot, so the voice states are known before anything is reported
      waitForGuilds: true,
      defaultReplyPing: false,
      gatewayDebug: false,
      logger: sdkLogger(this.logger)
    })
    this.client = client
    this.listen(client)
    guardGateway(client, origin)
    try {
      await client.login(this.instance.botToken)
    } catch (error) {
      this.client = undefined
      await client.destroy().catch(() => undefined)
      throw error
    }
  }

  public async stop() {
    const client = this.client
    if (!client) return
    this.logger.info('Logging out...')
    this.client = undefined
    await client.destroy()
  }

  private listen(client: Client) {
    client.on(Events.Ready, () => {
      this.logger.info(`Logged in as ${client.user?.username} (${client.user?.id})`)
      if (this.ready) return
      this.ready = true
      for (const handler of this.readyHandlers) handler()
    })
    client.on(Events.Error, (error) => this.logger.error(error))
    client.on(Events.ShardError, (shardId, error) => this.logger.error(`Gateway shard ${shardId}:`, error))
    client.on(Events.ShardDisconnect, (shardId, code) => this.logger.warn(`Gateway shard ${shardId} disconnected (${code})`))

    // A Guild Create or Guild Sync with voice states sends this first; Guild Create then sends GuildAvailable or GuildCreate
    // in the same handler. One without voice states sends only the latter, which then means nobody is in voice.
    client.on(Events.VoiceStatesSync, ({ guildId, voiceStates }) => {
      this.tracker.rebaseline(
        guildId,
        voiceStates.flatMap((state) => toUpdate(guildId, state) ?? [])
      )
      this.syncedGuildId = guildId
      queueMicrotask(() => {
        this.syncedGuildId = undefined
      })
    })
    const snapshot = (guild: Guild) => {
      if (this.syncedGuildId !== guild.id) this.tracker.rebaseline(guild.id, [])
    }
    client.on(Events.GuildAvailable, snapshot)
    client.on(Events.GuildCreate, snapshot)
    // Unknown until the next Guild Create: no change is reported for a guild the bot cannot see
    client.on(Events.GuildUnavailable, (guild) => this.tracker.forget(guild.id))
    client.on(Events.GuildDelete, (guild) => this.tracker.forget(guild.id))

    client.on(Events.VoiceStateUpdate, (state) => this.onVoiceState(client, state))
    client.on(Events.MessageCreate, (message) => this.onMessageCreate(client, message))
  }

  private onVoiceState(client: Client, state: WireVoiceState) {
    // Calls have no guild
    if (!state.guild_id) return
    const update = toUpdate(state.guild_id, state)
    if (!update) return
    const delta = this.tracker.apply(update)
    if (!delta) return
    this.presenceQueue = this.presenceQueue
      .then(() => this.reportPresence(client, delta, state.member))
      .catch((error) => {
        this.logger.error('Failed to report a voice change:', error)
      })
  }

  // The member in the voice state first, as it is still there when the user has just left or been removed from the guild;
  // then the cache, then the API. When none has the user, the change is still reported, with the user id as the name.
  private async resolveMember(guild: Guild, userId: string, payload: WireVoiceState['member']): Promise<MemberView> {
    if (payload?.user?.username) return toMemberView(this.scope, new GuildMember(guild.client, payload as GuildMemberData, guild))
    const cached = guild.members.get(userId)
    // Members from the first Guild Create have only an id
    if (cached?.user.username) return toMemberView(this.scope, cached)
    try {
      return toMemberView(this.scope, await guild.members.fetch(userId))
    } catch (error) {
      this.logger.warn(`Cannot fetch member ${userId} of guild ${guild.id}, reported by id:`, error)
      return { scope: fluxerGuild(this.scope, guild.id), userId, username: userId, displayName: userId }
    }
  }

  private async reportPresence(client: Client, delta: PresenceDelta, payload: WireVoiceState['member']) {
    if (!this.presenceHandler) return
    const guild = client.guilds.get(delta.guildId)
    if (!guild) return
    const key = fluxerGuild(this.scope, guild.id)
    // A channel the bot cannot see has no name; that side is left out
    const left = delta.left ? toChannelView(client, key, delta.left) : undefined
    const entered = delta.entered ? toChannelView(client, key, delta.entered) : undefined
    if (!left && !entered) return
    const member = await this.resolveMember(guild, delta.userId, payload)
    this.presenceHandler({ member, guildName: guild.name, left, entered })
  }

  private onMessageCreate(client: Client, message: Message) {
    if (!message.guildId) return
    const guild = fluxerGuild(this.scope, message.guildId)
    if (isCommand(message.content, client.user?.id ?? '')) {
      this.onCommandMessage(client, guild, message).catch((error) => this.logger.error('Command failed:', error))
      return
    }
    this.messageHandler?.(toMessageView(client, guild, message))
  }

  private async onCommandMessage(client: Client, key: GuildKey, message: Message) {
    if (message.author.bot || message.webhookId) return
    const parsed = parseCommand(message.content, client.user?.id ?? '')
    if (!parsed) return
    const reply = toReply(message)
    if (parsed.kind !== 'command') {
      const languages = this.lang.entries().map(([id, value]): [string, string] => [id, value.displayName])
      await reply.send([genHelpEmbed(`@${client.user?.username ?? 'bot'}`, languages, this.ttsProviderIds, parsed.kind === 'invalid' ? parsed.error : undefined)])
      return
    }
    if (!this.commandHandler) {
      this.logger.warn(`No handler for ${parsed.name}, ignored`)
      return
    }
    const guild = client.guilds.get(key.guildId)
    if (!guild) return
    // Fetched, not cached, so roles are current; a member that cannot be fetched is ignored as on Discord
    let member: GuildMember
    try {
      member = await guild.members.fetch(message.author.id)
    } catch (error) {
      this.logger.warn(`Cannot fetch member ${message.author.id} of guild ${guild.id}:`, error)
      return
    }
    await this.commandHandler({
      name: parsed.name,
      options: parsed.options,
      guild: key,
      operator: toMemberView(this.scope, member),
      channelId: message.channelId,
      operatorVoiceChannels: () => this.tracker.channelsOf(guild.id, member.id),
      // Guild-level permission (owner and Administrator included), without channel overwrites, as on Discord
      access: { manageMessages: member.permissions.has(PermissionFlags.ManageMessages), botAdmin: this.instance.admins.includes(member.id) },
      reply
    })
  }
}

// Fluxer has no private replies: every reply is a public reply to the command, private or not.
// Replies only carry results and errors, never settings that are secret.
function toReply(message: Message): CommandReply {
  return {
    async send(embeds) {
      const sent = await message.reply({ embeds: embeds.map(toFluxerEmbed), ping: false })
      return {
        async edit(edited) {
          await sent.edit({ embeds: edited.map(toFluxerEmbed) })
        }
      }
    }
  }
}
