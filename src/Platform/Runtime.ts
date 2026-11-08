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
  readonly voice: VoicePlayback
  selfUserId(): string
  onReady(handler: () => void): void
  // Guild messages only
  onMessage(handler: (message: MessageView) => void): void
  // Includes the bot's own changes
  onVoicePresence(handler: (change: VoicePresenceChange) => void): void
  onCommand(handler: (request: CommandRequest) => Promise<void>): void
  start(): void
  stop(): Promise<void>
}
