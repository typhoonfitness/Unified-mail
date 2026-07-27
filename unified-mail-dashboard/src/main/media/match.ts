// Pure helpers for the screensaver/ambient system — no DB or Electron imports,
// so they're trivially unit-testable.

import { basename, extname } from 'path'
import type { MediaFile } from '@shared/types'

export const GIF_EXT = new Set(['.gif', '.png', '.jpg', '.jpeg', '.webp'])
export const AUDIO_EXT = new Set([
  '.mp3',
  '.ogg',
  '.wav',
  '.m4a',
  '.flac',
  '.aac'
])

// gif-name keyword -> candidate sound-name keywords (first match wins).
const SOUND_HINTS: Array<[string, string[]]> = [
  ['snow', ['snow']],
  ['winter', ['snow']],
  ['desert', ['desert']],
  ['dune', ['desert']],
  ['rain', ['rain', 'thunder']],
  ['storm', ['storm', 'rain', 'thunder']],
  ['thunder', ['thunder', 'rain']],
  ['forest', ['forest']],
  ['tree', ['forest']],
  ['jungle', ['jungle', 'forest']],
  ['waterfall', ['waterfall', 'jungle']],
  ['ocean', ['ocean', 'waves']],
  ['sea', ['ocean', 'waves']],
  ['beach', ['ocean', 'waves']],
  ['wave', ['waves', 'ocean']],
  ['water', ['waterfall', 'ocean']],
  ['city', ['cyberpunk', 'jazz']],
  ['cyber', ['cyberpunk']],
  ['neon', ['cyberpunk']],
  ['night', ['jazz', 'cyberpunk']],
  ['noir', ['jazz']],
  ['jazz', ['jazz']],
  ['cafe', ['jazz']]
]

// Given a gif filename, pick the best-matching ambient file (or null).
export function matchAmbientForGif(
  gifName: string,
  ambient: MediaFile[]
): MediaFile | null {
  const g = basename(gifName, extname(gifName)).toLowerCase()
  const findSound = (kw: string): MediaFile | undefined =>
    ambient.find((a) => a.name.toLowerCase().includes(kw))

  for (const [gifKw, soundKws] of SOUND_HINTS) {
    if (g.includes(gifKw)) {
      for (const sk of soundKws) {
        const hit = findSound(sk)
        if (hit) return hit
      }
    }
  }
  for (const word of g.split(/[^a-z]+/).filter((w) => w.length >= 4)) {
    const hit = findSound(word)
    if (hit) return hit
  }
  return null
}

export function mimeForMedia(name: string): string {
  const ext = extname(name).toLowerCase()
  const map: Record<string, string> = {
    '.gif': 'image/gif',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac'
  }
  return map[ext] ?? 'application/octet-stream'
}
