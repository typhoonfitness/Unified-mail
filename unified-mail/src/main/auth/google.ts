// Google (Gmail) provider: authorize, fetch identity, and refresh tokens.

import { googleConfig, googleClientSecret, assertProviderConfigured } from '../config'
import { runAuthorizationFlow, refreshAccessToken, type TokenResponse } from './oauth'

export async function authorizeGoogle(): Promise<TokenResponse> {
  assertProviderConfigured('google')
  return runAuthorizationFlow({
    config: googleConfig,
    clientSecret: googleClientSecret || undefined,
    extraAuthParams: {
      // Required for Google to return a refresh token for a desktop app.
      access_type: 'offline',
      // select_account shows the account chooser (so you can add a *different*
      // Gmail); consent guarantees a refresh token is issued.
      prompt: 'select_account consent'
    }
  })
}

export async function refreshGoogle(refreshToken: string): Promise<TokenResponse> {
  return refreshAccessToken({
    tokenUrl: googleConfig.tokenUrl,
    clientId: googleConfig.clientId,
    clientSecret: googleClientSecret || undefined,
    refreshToken
  })
}

export interface GoogleIdentity {
  email: string
  displayName: string | null
}

export async function fetchGoogleIdentity(
  accessToken: string
): Promise<GoogleIdentity> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch Google identity (${res.status})`)
  }
  const data = (await res.json()) as { email: string; name?: string }
  return { email: data.email, displayName: data.name ?? null }
}
