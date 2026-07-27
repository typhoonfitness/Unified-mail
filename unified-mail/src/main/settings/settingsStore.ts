// App settings persisted as a single JSON blob in SQLite.

import { getDb } from '../db'
import type { AppSettings } from '@shared/types'

const KEY = 'app'

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  notifications: true,
  doNotDisturb: false,
  syncSeconds: 60,
  autoLaunch: false,
  signatures: {},
  phosphor: 'mono',
  effects: {
    scanlines: true,
    glow: true,
    flicker: false,
    grain: false,
    sweep: false,
    glitch: false,
    chromatic: false,
    pulse: false,
    rain: false,
    snow: false,
    petals: false,
    embers: false
  },
  font: 'Courier Prime',
  fontScale: 100,
  linkIconStyle: 'letter',
  broker: 'webull',
  autoLoadImages: false,
  savedSearches: [],
  vipSenders: [],
  startView: 'dashboard',
  ambientAutostart: false,
  ambientTrack: '',
  ambientGif: '',
  ambientVolume: 0.5,
  musicAutostart: false,
  musicTrack: '',
  musicVolume: 0.8,
  undoSendSeconds: 10,
  aiProvider: 'none',
  aiApiKey: '',
  aiModel: '',
  aiBaseUrl: '',
  rules: [],
  signatureList: []
}

export function getSettings(): AppSettings {
  const db = getDb()
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY) as
    | { value: string }
    | undefined
  if (!row) return { ...DEFAULT_SETTINGS }
  try {
    const saved = JSON.parse(row.value) as Partial<AppSettings>
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      // Deep-merge nested objects so newly-added keys get their defaults.
      effects: { ...DEFAULT_SETTINGS.effects, ...(saved.effects ?? {}) },
      signatures: { ...(saved.signatures ?? {}) }
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function setSettings(partial: Partial<AppSettings>): AppSettings {
  const db = getDb()
  const merged: AppSettings = { ...getSettings(), ...partial }
  // Merge signatures rather than replacing wholesale.
  if (partial.signatures) {
    merged.signatures = { ...getSettings().signatures, ...partial.signatures }
  }
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (@key, @value)
     ON CONFLICT(key) DO UPDATE SET value = @value`
  ).run({ key: KEY, value: JSON.stringify(merged) })
  return merged
}
