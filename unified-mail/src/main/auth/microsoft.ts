// Microsoft (Outlook / Microsoft 365) provider: authorize, fetch identity via
// Microsoft Graph, and refresh tokens.

import { microsoftConfig, assertProviderConfigured } from '../config'
import { runAuthorizationFlow, refreshAccessToken, type TokenResponse } from './oauth'

export async function authorizeMicrosoft(): Promise<TokenResponse> {
  assertProviderConfigured('microsoft')
  return runAuthorizationFlow({
    config: microsoftConfig,
    // offline_access (in scopes) is what gets us a refresh token here.
    extraAuthParams: {
      prompt: 'select_account'
    },
    // Azure ignores the port for a registered http://localhost redirect, but
    // the host ("localhost") and empty path must match exactly.
    loopback: { host: 'localhost', redirectPath: '' }
  })
}

export async function refreshMicrosoft(
  refreshToken: string
): Promise<TokenResponse> {
  // Do NOT send `scope` on refresh: echoing scopes (especially the reserved
  // OIDC ones like `email`) makes Azure return invalid_scope. Omitting it makes
  // the token reuse exactly the scopes originally granted.
  return refreshAccessToken({
    tokenUrl: microsoftConfig.tokenUrl,
    clientId: microsoftConfig.clientId,
    refreshToken
  })
}

export interface MicrosoftIdentity {
  email: string
  displayName: string | null
}

export async function fetchMicrosoftIdentity(
  accessToken: string
): Promise<MicrosoftIdentity> {
  const res = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch Microsoft identity (${res.status})`)
  }
  const data = (await res.json()) as {
    mail?: string
    userPrincipalName?: string
    displayName?: string
  }
  const email = data.mail ?? data.userPrincipalName
  if (!email) throw new Error('Microsoft account did not return an email.')
  return { email, displayName: data.displayName ?? null }
}
