// A privileged `media://` scheme that serves files from the configured gifs and
// ambient folders. Used by the screensaver card so the renderer can display
// local images/audio without exposing raw file paths, and with a path-traversal
// guard so only files inside the two folders are reachable.

import { protocol, net } from 'electron'
import { readFile } from 'fs/promises'
import { join, resolve } from 'path'
import { pathToFileURL } from 'url'
import { getDashboardConfig } from '../dashboard/config'
import { mimeForMedia } from './library'

// Must be called BEFORE app is ready.
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'media',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true
      }
    }
  ])
}

function folderFor(host: string): string | null {
  const cfg = getDashboardConfig()
  if (host === 'gifs') return cfg.gifsFolder
  if (host === 'ambient') return cfg.ambientFolder
  if (host === 'music') return cfg.musicFolder
  return null
}

// Must be called AFTER app is ready.
export function handleMediaProtocol(): void {
  protocol.handle('media', async (request) => {
    try {
      const url = new URL(request.url)
      const folder = folderFor(url.host)
      const name = decodeURIComponent(url.pathname).replace(/^\/+/, '')
      // Music may live in subfolders, so allow '/' there; always block '..'.
      const badChars = url.host === 'music' ? /\.\./ : /[\\/]|\.\./
      if (!folder || !name || badChars.test(name)) {
        return new Response('Not found', { status: 404 })
      }
      const full = join(folder, name)
      // Guard: resolved path must stay within the configured folder.
      if (!resolve(full).startsWith(resolve(folder))) {
        return new Response('Forbidden', { status: 403 })
      }
      // Prefer streaming (range support) via net.fetch of the file URL.
      try {
        return await net.fetch(pathToFileURL(full).toString())
      } catch {
        const data = await readFile(full)
        return new Response(new Uint8Array(data), {
          headers: { 'content-type': mimeForMedia(name) }
        })
      }
    } catch {
      return new Response('Error', { status: 500 })
    }
  })
}
