import type { ILogObj, Logger } from 'tslog'
import type { CommandRequest } from './Command'
import type { PlatformScope } from './Scope'
import type { TextOutput } from './TextOutput'
import type { MessageView, VoicePresenceChange } from './Views'
import type { VoicePlayback } from './VoicePlayback'

// What VoiceLog needs from a platform. Creating a runtime must not connect; start() does.
export interface PlatformRuntime {
  readonly scope: PlatformScope
  readonly logger: Logger<ILogObj>
  readonly text: TextOutput
  // Undefined when the platform cannot play voice: voice commands then answer that voice is unavailable
  readonly voice: VoicePlayback | undefined
  selfUserId(): string
  // Called when the platform is ready; VoiceLog then reconnects the voice channels it was in
  onReady(handler: () => void): void
  // Guild messages only, never commands
  onMessage(handler: (message: MessageView) => void): void
  // Includes the bot's own changes
  onVoicePresence(handler: (change: VoicePresenceChange) => void): void
  onCommand(handler: (request: CommandRequest) => Promise<void>): void
  // Rejects when the platform cannot start; App/Bot.ts startServices decides what happens then
  start(): Promise<void>
  stop(): Promise<void>
}
