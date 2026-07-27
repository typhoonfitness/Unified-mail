// Core OAuth 2.0 Authorization Code + PKCE flow for desktop.
//
// Flow:
//   1. Start a loopback server -> get redirect_uri.
//   2. Build the provider authorize URL (with PKCE challenge + state).
//   3. Open an Electron auth window to that URL; the user signs in.
//   4. Provider redirects to the loopback with ?code; we capture it.
//   5. Exchange code + verifier for access + refresh tokens at the token URL.
//
// No client secret is required (public client). Google optionally accepts a
// non-confidential "installed app" secret; we include it only if provided.

import { BrowserWindow } from 'electron'
import type { ProviderConfig } from '../config'
import { createPkce, randomState } from './pkce'
import { startLoopback, type LoopbackOptions } from './loopback'

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number // seconds
  scope?: string
  token_type: string
  id_token?: string
}

export interface AuthorizeOptions {
  config: ProviderConfig
  clientSecret?: string
  // Extra auth params, e.g. Google needs access_type=offline & prompt=consent
  // to reliably return a refresh token.
  extraAuthParams?: Record<string, string>
  // Provider-specific loopback host/path (see LoopbackOptions).
  loopback?: LoopbackOptions
}

function openAuthWindow(authUrl: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 520,
    height: 720,
    title: 'Sign in',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // A dedicated partition keeps the auth session isolated and lets us
      // support multiple accounts of the same provider without cookie clashes.
      partition: `auth-${Date.now()}`
    }
  })
  win.loadURL(authUrl)
  return win
}

export async function runAuthorizationFlow(
  opts: AuthorizeOptions
): Promise<TokenResponse> {
  const { config, clientSecret, extraAuthParams } = opts
  if (!config.clientId) {
    throw new Error('Missing OAuth client ID for this provider.')
  }

  const loopback = await startLoopback(opts.loopback)
  const pkce = createPkce()
  const state = randomState()

  const authUrl = new URL(config.authUrl)
  authUrl.searchParams.set('client_id', config.clientId)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('redirect_uri', loopback.redirectUri)
  authUrl.searchParams.set('scope', config.scopes.join(' '))
  authUrl.searchParams.set('code_challenge', pkce.challenge)
  authUrl.searchParams.set('code_challenge_method', pkce.method)
  authUrl.searchParams.set('state', state)
  for (const [k, v] of Object.entries(extraAuthParams ?? {})) {
    authUrl.searchParams.set(k, v)
  }

  const win = openAuthWindow(authUrl.toString())

  // If the user closes the auth window before completing, reject cleanly.
  const closedPromise = new Promise<never>((_, reject) => {
    win.on('closed', () =>
      reject(new Error('Sign-in window was closed before completing.'))
    )
  })

  try {
    const { code } = await Promise.race([
      loopback.waitForCode(state),
      closedPromise
    ])

    const tokens = await exchangeCodeForTokens({
      tokenUrl: config.tokenUrl,
      clientId: config.clientId,
      clientSecret,
      code,
      codeVerifier: pkce.verifier,
      redirectUri: loopback.redirectUri
    })
    return tokens
  } finally {
    loopback.close()
    if (!win.isDestroyed()) win.destroy()
  }
}

interface ExchangeParams {
  tokenUrl: string
  clientId: string
  clientSecret?: string
  code: string
  codeVerifier: string
  redirectUri: string
}

async function exchangeCodeForTokens(
  p: ExchangeParams
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: p.clientId,
    grant_type: 'authorization_code',
    code: p.code,
    code_verifier: p.codeVerifier,
    redirect_uri: p.redirectUri
  })
  if (p.clientSecret) body.set('client_secret', p.clientSecret)

  const res = await fetch(p.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token exchange failed (${res.status}): ${text}`)
  }
  return (await res.json()) as TokenResponse
}

export async function refreshAccessToken(params: {
  tokenUrl: string
  clientId: string
  clientSecret?: string
  refreshToken: string
  scopes?: string[]
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken
  })
  if (params.clientSecret) body.set('client_secret', params.clientSecret)
  if (params.scopes) body.set('scope', params.scopes.join(' '))

  const res = await fetch(params.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Token refresh failed (${res.status}): ${text}`)
  }
  return (await res.json()) as TokenResponse
}
