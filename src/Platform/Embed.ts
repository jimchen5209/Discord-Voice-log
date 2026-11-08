// The embed fields VoiceLog uses; each platform converts it to its own format
export interface Embed {
  title?: string
  description?: string
  color?: number
  timestamp?: string
  author?: { name: string; iconUrl?: string }
  fields?: { name: string; value: string }[]
}
