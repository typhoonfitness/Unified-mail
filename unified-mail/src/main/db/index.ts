// Opens the SQLite database in the OS user-data directory and runs migrations.
// A single shared connection is used across the main process.

import Database from 'better-sqlite3'
import { app } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { migrate } from './schema'

let db: Database.Database | null = null

// Test-only: inject an in-memory database so store logic can be exercised
// without Electron. Never called in production code paths.
export function __setDbForTests(d: Database.Database | null): void {
  db = d
}

export function getDb(): Database.Database {
  if (db) return db

  // e.g. ~/Library/Application Support/unified-mail (macOS),
  //      %APPDATA%/unified-mail (Windows), ~/.config/unified-mail (Linux)
  const dataDir = join(app.getPath('userData'), 'data')
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }

  const dbPath = join(dataDir, 'mail.db')
  db = new Database(dbPath)
  // Enable the REGEXP operator (used by the "dated emails" smart filter).
  db.function('regexp', { deterministic: true }, (pattern, value) => {
    if (value == null) return 0
    try {
      return new RegExp(String(pattern), 'i').test(String(value)) ? 1 : 0
    } catch {
      return 0
    }
  })
  migrate(db)
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
