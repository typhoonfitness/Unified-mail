// Dashboard configuration (weather location, tickers, calendar, feeds),
// persisted as a JSON blob in the settings table.

import { homedir } from 'os'
import { join } from 'path'
import { getDb } from '../db'
import type { DashboardConfig } from '@shared/types'

const KEY = 'dashboard'

export const DEFAULT_DASHBOARD: DashboardConfig = {
  weather: { name: 'Detroit', lat: 42.3314, lon: -83.0458 },
  useFahrenheit: true,
  symbols: ['VOO', 'SPY', 'AAPL', 'BTC-USD'],
  icalUrl: '',
  newsFeeds: [
    'https://feeds.arstechnica.com/arstechnica/index',
    'https://hnrss.org/frontpage'
  ],
  youtubeUrl: '',
  spotifyUrl: '',
  iptvUrl: '',
  gifsFolder: join(homedir(), 'gifs'),
  ambientFolder: join(homedir(), 'Downloads', 'background noises'),
  musicFolder: join(homedir(), 'Music'),
  socialReddit: ['technology', 'worldnews'],
  socialBluesky: [],
  newsTopics: [],
  holdings: [],
  layout: []
}

export function getDashboardConfig(): DashboardConfig {
  const db = getDb()
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(KEY) as
    | { value: string }
    | undefined
  if (!row) return { ...DEFAULT_DASHBOARD }
  try {
    return { ...DEFAULT_DASHBOARD, ...(JSON.parse(row.value) as Partial<DashboardConfig>) }
  } catch {
    return { ...DEFAULT_DASHBOARD }
  }
}

export function setDashboardConfig(
  partial: Partial<DashboardConfig>
): DashboardConfig {
  const db = getDb()
  const merged = { ...getDashboardConfig(), ...partial }
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (@key, @value)
     ON CONFLICT(key) DO UPDATE SET value = @value`
  ).run({ key: KEY, value: JSON.stringify(merged) })
  return merged
}
