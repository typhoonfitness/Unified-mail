// High-level account/session manager. Orchestrates the connect flow and
// provides valid access tokens on demand with silent refresh.
//
// This is the module the rest of the app (sync engine in Prompt 2, send in
// Prompt 4) will call to get a fresh access token for an account.

import type { Provider, ConnectedAccount } from '@shared/types'
import {
  authorizeGoogle,
  refreshGoogle,
  fetchGoogleIdentity
} from './google'
import {
  authorizeMicrosoft,
  refreshMicrosoft,
  fetchMicrosoftIdentity
} from './microsoft'
import type { TokenResponse } from './oauth'
import {
  accountId,
  upsertAccount,
  saveAccessToken,
  getTokens,
  listAccounts as listAccountRecords,
  deleteAccount,
  type AccountRecord
} from './tokenStore'

// Refresh a bit early to avoid using a token that expires mid-request.
const EXPIRY_SKEW_MS = 60_000

function toConnectedAccount(r: AccountRecord): ConnectedAccount {
  return {
    id: r.id,
    provider: r.provider,
    email: r.email,
    displayName: r.displayName,
    connectedAt: r.connectedAt
  }
}

async function fetchIdentity(
  provider: Provider,
  accessToken: string
): Promise<{ email: string; displayName: string | null }> {
  return provider === 'google'
    ? fetchGoogleIdentity(accessToken)
    : fetchMicrosoftIdentity(accessToken)
}

export async function connectAccount(
  provider: Provider
): Promise<ConnectedAccount> {
  const tokens: TokenResponse =
    provider === 'google' ? await authorizeGoogle() : await authorizeMicrosoft()

  const identity = await fetchIdentity(provider, tokens.access_token)
  const id = accountId(provider, identity.email)
  const now = Date.now()

  const record: AccountRecord = {
    id,
    provider,
    email: identity.email,
    displayName: identity.displayName,
    connectedAt: now
  }

  upsertAccount(record, {
    refreshToken: tokens.refresh_token ?? null,
    accessToken: tokens.access_token,
    accessTokenExpiry: now + tokens.expires_in * 1000,
    scope: tokens.scope ?? null
  })

  return toConnectedAccount(record)
}

export function listConnectedAccounts(): ConnectedAccount[] {
  return listAccountRecords().map(toConnectedAccount)
}

export function disconnectAccount(id: string): void {
  deleteAccount(id)
}

// Returns a valid access token for the account, refreshing silently if needed.
export async function getValidAccessToken(id: string): Promise<string> {
  const [provider] = id.split(':') as [Provider]
  const tokens = getTokens(id)
  if (!tokens) throw new Error(`No such account: ${id}`)

  const stillValid =
    tokens.accessToken &&
    tokens.accessTokenExpiry &&
    tokens.accessTokenExpiry - EXPIRY_SKEW_MS > Date.now()

  if (stillValid) return tokens.accessToken as string

  if (!tokens.refreshToken) {
    throw new Error(
      `Account ${id} has no refresh token; user must reconnect.`
    )
  }

  const refreshed: TokenResponse =
    provider === 'google'
      ? await refreshGoogle(tokens.refreshToken)
      : await refreshMicrosoft(tokens.refreshToken)

  const expiry = Date.now() + refreshed.expires_in * 1000
  saveAccessToken(id, refreshed.access_token, expiry)

  // Microsoft may rotate the refresh token; persist the new one if present.
  if (refreshed.refresh_token) {
    const record = listAccountRecords().find((a) => a.id === id)
    if (record) {
      upsertAccount(record, {
        refreshToken: refreshed.refresh_token,
        accessToken: refreshed.access_token,
        accessTokenExpiry: expiry,
        scope: refreshed.scope ?? tokens.scope
      })
    }
  }

  return refreshed.access_token
}
