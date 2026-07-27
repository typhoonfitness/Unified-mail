// Per-account sync cursors and timestamps.

import { getDb } from '../db'
import type { SyncCursor } from './types'

export interface SyncStateRow {
  accountId: string
  historyId: string | null
  deltaLink: string | null
  lastFullSyncAt: number | null
  lastSyncAt: number | null
}

export function getSyncState(accountId: string): SyncStateRow | null {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT account_id, history_id, delta_link, last_full_sync_at, last_sync_at
         FROM sync_state WHERE account_id = ?`
    )
    .get(accountId) as
    | {
        account_id: string
        history_id: string | null
        delta_link: string | null
        last_full_sync_at: number | null
        last_sync_at: number | null
      }
    | undefined
  if (!row) return null
  return {
    accountId: row.account_id,
    historyId: row.history_id,
    deltaLink: row.delta_link,
    lastFullSyncAt: row.last_full_sync_at,
    lastSyncAt: row.last_sync_at
  }
}

export function saveCursor(
  accountId: string,
  cursor: SyncCursor,
  opts: { full: boolean }
): void {
  const db = getDb()
  const now = Date.now()
  db.prepare(
    `INSERT INTO sync_state
        (account_id, history_id, delta_link, last_full_sync_at, last_sync_at)
     VALUES (@id, @historyId, @deltaLink, @fullAt, @syncAt)
     ON CONFLICT(account_id) DO UPDATE SET
        history_id = COALESCE(@historyId, sync_state.history_id),
        delta_link = COALESCE(@deltaLink, sync_state.delta_link),
        last_full_sync_at = COALESCE(@fullAt, sync_state.last_full_sync_at),
        last_sync_at = @syncAt`
  ).run({
    id: accountId,
    historyId: cursor.historyId ?? null,
    deltaLink: cursor.deltaLink ?? null,
    fullAt: opts.full ? now : null,
    syncAt: now
  })
}
