export enum VoiceMessageTTSType {
  WaveNet = 'WaveNet',
  Legacy = 'Legacy'
}

export interface IVoiceMessageTTS {
  enabled: boolean
  messageLang: string
  type: VoiceMessageTTSType
  voiceLang: string
  voiceName: string
}

export interface IServerConfig {
  serverID: string
  lang: string
  channelID: string
  lastVoiceChannel: string
  currentVoiceChannel: string
  voiceMessageTTS: IVoiceMessageTTS
}
