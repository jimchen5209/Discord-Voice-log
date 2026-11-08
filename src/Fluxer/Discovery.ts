// Instance discovery (GET /.well-known/fluxer) and the rule for where the bot token may go.
// Endpoints are used as the document gives them, path included; nothing is built from the origin.

const DISCOVERY_PATH = '/.well-known/fluxer'
const DISCOVERY_TIMEOUT_MS = 10 * 1000

export interface FluxerEndpoints {
  // REST base for bots, e.g. https://fluxer.com/api
  apiPublic: string
  // Media host for avatar URLs, when the document has one
  media?: string
  apiCodeVersion: number
  voiceEnabled: boolean
  // Origins of the instance's voice servers, e.g. wss://*.fluxer.media; empty when the instance lists none
  voiceOrigins: string[]
}

// The token only goes to the configured origin's host or a subdomain of it, over https/wss
export function isTrustedEndpoint(endpoint: string, origin: string, protocol: 'https:' | 'wss:') {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  const host = new URL(origin).hostname
  return url.protocol === protocol && (url.hostname === host || url.hostname.endsWith(`.${host}`))
}

// The LiveKit endpoint of a Voice Server Update: TLS only, under one of the instance's voice_origins, or,
// when it lists none, on the origin's host or a subdomain. https:// (self-hosted instances send it) is connected
// to as wss://, and a scheme-less endpoint is wss://.
export function isTrustedVoiceEndpoint(endpoint: string, origin: string, voiceOrigins: string[]) {
  let url: URL
  try {
    url = new URL(/^[a-z]+:\/\//i.test(endpoint) ? endpoint : `wss://${endpoint}`)
  } catch {
    return false
  }
  if (url.protocol === 'https:') url.protocol = 'wss:'
  if (url.protocol !== 'wss:') return false
  if (voiceOrigins.length === 0) return isTrustedEndpoint(url.toString(), origin, 'wss:')
  return voiceOrigins.some((source) => {
    const wildcard = source.match(/^wss:\/\/\*\.([^/:]+)(:\d+)?\/?$/i)
    if (wildcard) return url.hostname.endsWith(`.${wildcard[1].toLowerCase()}`) && url.port === (wildcard[2]?.slice(1) ?? '')
    try {
      return new URL(source).origin === url.origin
    } catch {
      return false
    }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Sends no token and follows no redirect. Errors name the URL but never a token.
export async function discoverInstance(origin: string): Promise<FluxerEndpoints> {
  const url = new URL(DISCOVERY_PATH, origin).toString()
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    headers: { accept: 'application/json' }
  })
  if (!response.ok) throw new Error(`Instance discovery ${url} answered HTTP ${response.status}`)
  const document: unknown = await response.json()
  if (!isRecord(document) || !isRecord(document.endpoints)) throw new Error(`Instance discovery ${url} has no endpoints`)

  const apiPublic = document.endpoints.api_public
  if (typeof apiPublic !== 'string' || !isTrustedEndpoint(apiPublic, origin, 'https:')) {
    throw new Error(`Instance discovery ${url}: endpoints.api_public ${JSON.stringify(apiPublic)} must be an https:// URL on ${new URL(origin).hostname} or a subdomain`)
  }
  const media = document.endpoints.media
  const features = isRecord(document.features) ? document.features : {}
  const voiceOrigins = Array.isArray(document.voice_origins) ? document.voice_origins.filter((source): source is string => typeof source === 'string') : []
  return {
    apiPublic,
    media: typeof media === 'string' && media.startsWith('https://') ? media : undefined,
    apiCodeVersion: typeof document.api_code_version === 'number' ? document.api_code_version : 0,
    voiceEnabled: features.voice_enabled === true,
    voiceOrigins
  }
}
