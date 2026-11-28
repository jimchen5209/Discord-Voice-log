// Splits an Ogg Opus stream into Opus packets (RFC 7845), dropping the OpusHead and OpusTags headers.
// Pure: no I/O. A packet may span pages; a page may be split across chunks.

const CAPTURE = Buffer.from('OggS')
const PAGE_HEADER_SIZE = 27

export class OggOpusDemuxer {
  private buffer: Buffer = Buffer.alloc(0)
  // Start of a packet that continues on the next page
  private partial: Buffer | undefined
  private headersLeft = 2

  public push(chunk: Buffer): Buffer[] {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk])
    const packets: Buffer[] = []
    for (;;) {
      if (this.buffer.length < PAGE_HEADER_SIZE) break
      if (!this.buffer.subarray(0, 4).equals(CAPTURE)) throw new Error('Not an Ogg page')
      const segmentCount = this.buffer[26]
      const tableEnd = PAGE_HEADER_SIZE + segmentCount
      if (this.buffer.length < tableEnd) break
      let bodySize = 0
      for (let i = PAGE_HEADER_SIZE; i < tableEnd; i++) bodySize += this.buffer[i]
      if (this.buffer.length < tableEnd + bodySize) break

      // Continued page with nothing to continue (stream started mid-packet): its first packet is dropped
      const continued = (this.buffer[5] & 1) === 1
      let dropFirst = continued && !this.partial
      let offset = tableEnd
      let size = 0
      for (let i = PAGE_HEADER_SIZE; i < tableEnd; i++) {
        const lacing = this.buffer[i]
        size += lacing
        if (lacing === 255) continue
        const piece = this.buffer.subarray(offset, offset + size)
        offset += size
        size = 0
        const packet = this.partial ? Buffer.concat([this.partial, piece]) : Buffer.from(piece)
        this.partial = undefined
        if (dropFirst) {
          dropFirst = false
          continue
        }
        if (this.headersLeft > 0) {
          this.headersLeft--
          continue
        }
        if (packet.length > 0) packets.push(packet)
      }
      // The last packet goes on in the next page
      if (size > 0) {
        const piece = Buffer.from(this.buffer.subarray(offset, offset + size))
        this.partial = this.partial ? Buffer.concat([this.partial, piece]) : piece
      }
      this.buffer = this.buffer.subarray(tableEnd + bodySize)
    }
    return packets
  }
}

// Samples per channel at 48 kHz in one Opus packet, from its TOC byte (RFC 6716 section 3.1)
export function opusSamples(packet: Buffer) {
  const config = packet[0] >> 3
  const frameMs = config < 12 ? [10, 20, 40, 60][config & 3] : config < 16 ? [10, 20][config & 1] : [2.5, 5, 10, 20][config & 3]
  const code = packet[0] & 3
  const frames = code === 0 ? 1 : code < 3 ? 2 : packet[1] & 0x3f
  return frameMs * 48 * frames
}
