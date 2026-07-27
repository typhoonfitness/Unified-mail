// Encrypted token persistence. Refresh/access tokens are encrypted at rest with
// Electron's safeStorage (OS keychain-backed on macOS/Windows; libsecret on
// Linux) and stored as ciphertext BLOBs in SQLite. Plaintext tokens never
// touch disk and never leave the main process.

import { safeStorage } from 'electron'
import type { Provider } from '@shared/types'
import { getDb } from '../db'

export interface StoredTokens {
  refreshToken: string | null
  accessToken: string | null
  accessTokenExpiry: number | null // epoch ms
  scope: string | null
}

export interface AccountRecord {
  id: string
  provider: Provider
  email: string
  displayName: string | null
  connectedAt: number
}

function encrypt(value: string | null): Buffer | null {
  if (value == null) return null
  if (!safeStorage.isEncryptionAvailable()) {
    // On a fresh Linux box without a keyring, safeStorage may be unavailable.
    // Fail loudly rather than silently persisting plaintext.
    throw new Error(
      'OS encryption (safeStorage) is unavailable. On Linux, ensure a keyring ' +
        '(gnome-keyring/kwallet) is running so tokens can be stored securely.'
    )
  }
  return safeStorage.encryptString(value)
}

function decrypt(buf: Buffer | null | undefined): string | null {
  if (!buf) return null
  return safeStorage.decryptString(buf)
}

export function accountId(provider: Provider, email: string): string {
  return `${provider}:${email.toLowerCase()}`
}

export function upsertAccount(
  record: AccountRecord,
  tokens: StoredTokens
): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO accounts
       (id, provider, email, display_name, connected_at,
        refresh_token_enc, access_token_enc, access_token_expiry, scope)
     VALUES
       (@id, @provider, @email, @displayName, @connectedAt,
        @refreshEnc, @accessEnc, @accessExpiry, @scope)
     ON CONFLICT(id) DO UPDATE SET
       display_name        = excluded.display_name,
       -- keep an existing refresh token if the new login didn't return one
       refresh_token_enc   = COALESCE(excluded.refresh_token_enc, accounts.refresh_token_enc),
       access_token_enc    = excluded.access_token_enc,
       access_token_expiry = excluded.access_token_expiry,
       scope               = excluded.scope`
  ).run({
    id: record.id,
    provider: record.provider,
    email: record.email,
    displayName: record.displayName,
    connectedAt: record.connectedAt,
    refreshEnc: encrypt(tokens.refreshToken),
    accessEnc: encrypt(tokens.accessToken),
    accessExpiry: tokens.accessTokenExpiry,
    scope: tokens.scope
  })
}

export function saveAccessToken(
  id: string,
  accessToken: string,
  expiry: number
): void {
  const db = getDb()
  db.prepare(
    `UPDATE accounts
       SET access_token_enc = @enc, access_token_expiry = @exp
     WHERE id = @id`
  ).run({ id, enc: encrypt(accessToken), exp: expiry })
}

export function getTokens(id: string): StoredTokens | null {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT refresh_token_enc, access_token_enc, access_token_expiry, scope
         FROM accounts WHERE id = @id`
    )
    .get({ id }) as
    | {
        refresh_token_enc: Buffer | null
        access_token_enc: Buffer | null
        access_token_expiry: number | null
        scope: string | null
      }
    | undefined
  if (!row) return null
  return {
    refreshToken: decrypt(row.refresh_token_enc),
    accessToken: decrypt(row.access_token_enc),
    accessTokenExpiry: row.access_token_expiry,
    scope: row.scope
  }
}

export function listAccounts(): AccountRecord[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT id, provider, email, display_name, connected_at
         FROM accounts ORDER BY connected_at ASC`
    )
    .all() as Array<{
    id: string
    provider: Provider
    email: string
    display_name: string | null
    connected_at: number
  }>
  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    email: r.email,
    displayName: r.display_name,
    connectedAt: r.connected_at
  }))
}

export function deleteAccount(id: string): void {
  const db = getDb()
  db.prepare(`DELETE FROM accounts WHERE id = @id`).run({ id })
}
