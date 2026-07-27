// SQLite schema. Prompt 1 only needs `accounts` (+ encrypted token storage).
// The messages/threads tables are added in Prompt 2, so we keep this focused
// but structured so it is easy to extend with migrations later.

import type Database from 'better-sqlite3'

export const SCHEMA_VERSION = 10

export function migrate(db: Database.Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  const prevVersion = getSchemaVersion(db)

  // --- v1: accounts ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id           TEXT PRIMARY KEY,          -- provider:email, stable per account
      provider     TEXT NOT NULL,             -- 'google' | 'microsoft'
      email        TEXT NOT NULL,
      display_name TEXT,
      connected_at INTEGER NOT NULL,          -- epoch ms
      -- Encrypted OAuth material. Ciphertext only; never plaintext tokens.
      refresh_token_enc BLOB,                 -- safeStorage-encrypted refresh token
      access_token_enc  BLOB,                 -- safeStorage-encrypted access token (cache)
      access_token_expiry INTEGER,            -- epoch ms
      scope        TEXT,
      UNIQUE (provider, email)
    );
  `)

  // --- v2: messages, threads, sync state ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS threads (
      id               TEXT PRIMARY KEY,      -- unified thread id (see normalize.ts)
      subject          TEXT NOT NULL DEFAULT '',
      snippet          TEXT NOT NULL DEFAULT '',
      last_message_at  INTEGER NOT NULL DEFAULT 0,
      message_count    INTEGER NOT NULL DEFAULT 0,
      unread_count     INTEGER NOT NULL DEFAULT 0,
      has_starred      INTEGER NOT NULL DEFAULT 0,
      last_message_id  TEXT NOT NULL DEFAULT '',
      participants_json TEXT NOT NULL DEFAULT '[]',
      account_ids_json TEXT NOT NULL DEFAULT '[]',
      providers_json   TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS messages (
      id                  TEXT PRIMARY KEY,   -- account_id + "::" + provider_message_id
      account_id          TEXT NOT NULL,
      provider            TEXT NOT NULL,
      provider_message_id TEXT NOT NULL,
      provider_thread_id  TEXT NOT NULL,
      unified_thread_id   TEXT NOT NULL,
      from_name           TEXT,
      from_email          TEXT,
      to_json             TEXT NOT NULL DEFAULT '[]',
      cc_json             TEXT NOT NULL DEFAULT '[]',
      subject             TEXT NOT NULL DEFAULT '',
      snippet             TEXT NOT NULL DEFAULT '',
      body_html           TEXT,
      body_text           TEXT,
      received_at         INTEGER NOT NULL DEFAULT 0,
      is_read             INTEGER NOT NULL DEFAULT 0,
      is_starred          INTEGER NOT NULL DEFAULT 0,
      folder              TEXT NOT NULL DEFAULT 'inbox',
      labels_json         TEXT NOT NULL DEFAULT '[]',
      has_attachments     INTEGER NOT NULL DEFAULT 0,
      attachments_json    TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(unified_thread_id);
    CREATE INDEX IF NOT EXISTS idx_messages_account ON messages(account_id);
    CREATE INDEX IF NOT EXISTS idx_messages_received ON messages(received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_folder ON messages(folder);

    CREATE TABLE IF NOT EXISTS sync_state (
      account_id        TEXT PRIMARY KEY,
      history_id        TEXT,                 -- Gmail incremental cursor
      delta_link        TEXT,                 -- Microsoft Graph delta cursor
      last_full_sync_at INTEGER,
      last_sync_at      INTEGER,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
  `)

  // --- v3: upgrade path for pre-existing v2 databases ---
  addColumnIfMissing(db, 'messages', 'attachments_json', `TEXT NOT NULL DEFAULT '[]'`)
  addColumnIfMissing(db, 'threads', 'last_message_id', `TEXT NOT NULL DEFAULT ''`)

  // Full-text search index over messages. Managed explicitly by the store
  // layer (insert/delete alongside message writes) rather than via triggers,
  // so it stays simple and testable. `msg_id` mirrors messages.id.
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      msg_id UNINDEXED,
      subject,
      snippet,
      body,
      sender
    );
  `)

  // --- v4: drafts + outbox ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS drafts (
      id                   TEXT PRIMARY KEY,
      account_id           TEXT NOT NULL,
      to_addr              TEXT NOT NULL DEFAULT '',
      cc_addr              TEXT NOT NULL DEFAULT '',
      bcc_addr             TEXT NOT NULL DEFAULT '',
      subject              TEXT NOT NULL DEFAULT '',
      body_html            TEXT NOT NULL DEFAULT '',
      mode                 TEXT NOT NULL DEFAULT 'new',
      in_reply_to_message_id TEXT,
      attachments_json     TEXT NOT NULL DEFAULT '[]',
      updated_at           INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS outbox (
      id           TEXT PRIMARY KEY,
      draft_id     TEXT NOT NULL,
      account_id   TEXT NOT NULL,
      subject      TEXT NOT NULL DEFAULT '',
      payload_json TEXT NOT NULL,          -- fully-resolved send payload
      status       TEXT NOT NULL DEFAULT 'pending',
      attempts     INTEGER NOT NULL DEFAULT 0,
      error        TEXT,
      send_after   INTEGER NOT NULL DEFAULT 0,
      updated_at   INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status);
  `)

  // --- v5: snooze + snippets ---
  addColumnIfMissing(db, 'threads', 'snoozed_until', `INTEGER NOT NULL DEFAULT 0`)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_threads_snooze ON threads(snoozed_until);

    CREATE TABLE IF NOT EXISTS snippets (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL DEFAULT '',
      keyword    TEXT NOT NULL DEFAULT '',   -- slash-command trigger word
      body_html  TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL DEFAULT 0
    );
  `)

  // --- v6: app settings (single JSON blob under a fixed key) ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // --- v8: a local "archived" flag (shared Archive view across accounts) ---
  addColumnIfMissing(db, 'messages', 'archived', `INTEGER NOT NULL DEFAULT 0`)
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_messages_archived ON messages(archived);`
  )

  // --- v9: a "bulk" flag (List-Unsubscribe / Gmail category) for smart filters.
  addColumnIfMissing(db, 'messages', 'bulk', `INTEGER NOT NULL DEFAULT 0`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_bulk ON messages(bulk);`)
  // --- v10: unsubscribe header + follow-up (remind-if-no-reply) columns.
  addColumnIfMissing(db, 'messages', 'unsubscribe', `TEXT`)
  addColumnIfMissing(db, 'threads', 'follow_up_at', `INTEGER NOT NULL DEFAULT 0`)
  addColumnIfMissing(db, 'threads', 'follow_up_base', `INTEGER NOT NULL DEFAULT 0`)
  addColumnIfMissing(db, 'threads', 'follow_up_due', `INTEGER NOT NULL DEFAULT 0`)
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_threads_followup ON threads(follow_up_at);`
  )

  // On first upgrade to v9/v10, force a full resync so the bulk flag and the
  // unsubscribe header get populated for existing mail (clears sync cursors).
  if (prevVersion > 0 && prevVersion < 10) {
    db.exec(`DELETE FROM sync_state`)
  }

  // --- v7: dashboard (to-do + quick links; config lives in settings) ---
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id         TEXT PRIMARY KEY,
      text       TEXT NOT NULL DEFAULT '',
      done       INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS links (
      id       TEXT PRIMARY KEY,
      title    TEXT NOT NULL DEFAULT '',
      url      TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0
    );
  `)

  const current = getSchemaVersion(db)
  if (current < SCHEMA_VERSION) {
    setSchemaVersion(db, SCHEMA_VERSION)
  }
}

function addColumnIfMissing(
  db: Database.Database,
  table: string,
  column: string,
  definition: string
): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string
  }>
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

export function getSchemaVersion(db: Database.Database): number {
  const row = db
    .prepare(`SELECT value FROM meta WHERE key = 'schema_version'`)
    .get() as { value: string } | undefined
  return row ? Number(row.value) : 0
}

function setSchemaVersion(db: Database.Database, v: number): void {
  db.prepare(
    `INSERT INTO meta (key, value) VALUES ('schema_version', @v)
     ON CONFLICT(key) DO UPDATE SET value = @v`
  ).run({ v: String(v) })
}
