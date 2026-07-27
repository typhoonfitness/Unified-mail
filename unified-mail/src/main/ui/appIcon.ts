// Resolves the Unified Mail app icon path across dev and packaged runs.

import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

let cached: string | null | undefined

export function appIconPath(): string | undefined {
  if (cached !== undefined) return cached ?? undefined
  const candidates = [
    join(process.cwd(), 'build', 'icon.png'),
    join(app.getAppPath(), 'build', 'icon.png'),
    join(app.getAppPath(), '..', 'build', 'icon.png'),
    join(process.resourcesPath ?? '', 'build', 'icon.png'),
    join(process.resourcesPath ?? '', 'icon.png')
  ]
  cached = candidates.find((p) => p && existsSync(p)) ?? null
  return cached ?? undefined
}
