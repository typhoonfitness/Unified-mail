// Lists gifs / ambient files from the configured folders. Keyword matching and
// mime helpers live in the dependency-free ./match module.

import { readdirSync } from 'fs'
import { readFile } from 'fs/promises'
import { extname, join, sep } from 'path'
import type { MediaFile, TrackMeta } from '@shared/types'
import { getDashboardConfig } from '../dashboard/config'
import { GIF_EXT, AUDIO_EXT } from './match'

export { matchAmbientForGif, mimeForMedia } from './match'

function listFolder(folder: string, exts: Set<string>, host: string): MediaFile[] {
  let names: string[] = []
  try {
    names = readdirSync(folder)
  } catch {
    return []
  }
  return names
    .filter((n) => exts.has(extname(n).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      url: `media://${host}/${encodeURIComponent(name)}`
    }))
}

export function listGifs(): MediaFile[] {
  return listFolder(getDashboardConfig().gifsFolder, GIF_EXT, 'gifs')
}

export function listAmbient(): MediaFile[] {
  return listFolder(getDashboardConfig().ambientFolder, AUDIO_EXT, 'ambient')
}

// Recursively list music files (relative paths) from the music folder. Fast:
// filenames only; metadata is fetched lazily per track via trackMeta().
export function listMusic(): MediaFile[] {
  const folder = getDashboardConfig().musicFolder
  let entries: string[] = []
  try {
    entries = readdirSync(folder, { recursive: true }) as string[]
  } catch {
    return []
  }
  return entries
    .filter((rel) => AUDIO_EXT.has(extname(rel).toLowerCase()))
    .slice(0, 8000) // safety cap for very large libraries
    .map((rel) => {
      const urlPath = rel
        .split(sep)
        .map((seg) => encodeURIComponent(seg))
        .join('/')
      return { name: rel.split(sep).join('/'), url: `media://music/${urlPath}` }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Lazy metadata (title/artist/album/genre/duration/art) via music-metadata,
// dynamically imported so a load failure degrades gracefully to filename info.
export async function trackMeta(name: string): Promise<TrackMeta> {
  const folder = getDashboardConfig().musicFolder
  const full = join(folder, name)
  try {
    const mm = await import('music-metadata')
    const buf = await readFile(full)
    const meta = await mm.parseBuffer(new Uint8Array(buf), undefined, {
      duration: true
    })
    const c = meta.common
    let art: string | undefined
    const pic = c.picture?.[0]
    if (pic) {
      art = `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}`
    }
    return {
      title: c.title,
      artist: c.artist,
      album: c.album,
      genre: c.genre?.[0],
      durationSec: meta.format.duration,
      art
    }
  } catch {
    return {}
  }
}
