// Loads OAuth client configuration. Reads from environment variables that are
// populated from a local .env file (see .env.example and SETUP_CREDENTIALS.md).
//
// No client SECRETS are required: both flows are public-client + PKCE, so only
// the client IDs (and Google's redirect handling) are needed. Nothing here is
// sensitive enough to ship, but we still keep it out of source control via .env.

import { config as loadDotenv } from 'dotenv'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

// In dev, .env sits at the project root. In a packaged app, allow an override
// via a .env placed next to the executable's resources.
function loadEnv(): void {
  const candidates = [
    join(process.cwd(), '.env'),
    join(app.getAppPath(), '.env'),
    join(process.resourcesPath ?? '', '.env')
  ]
  for (const p of candidates) {
    if (p && existsSync(p)) {
      loadDotenv({ path: p })
      return
    }
  }
  // Fall back to any already-present process env vars.
  loadDotenv()
}

loadEnv()

export interface ProviderConfig {
  clientId: string
  authUrl: string
  tokenUrl: string
  scopes: string[]
}

function required(name: string): string {
  const v = process.env[name]
  if (!v || v.trim() === '') {
    // Do not throw at import time; surface a helpful error only when the
    // provider is actually used so the app can still boot to the Connect screen.
    return ''
  }
  return v.trim()
}

export const googleConfig: ProviderConfig = {
  clientId: required('GOOGLE_CLIENT_ID'),
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  scopes: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/userinfo.email',
    'openid'
  ]
}

// Some Google desktop OAuth clients also ship a client "secret". It is NOT a
// true secret for installed apps, but Google's token endpoint accepts/optionally
// requires it. Left blank when using pure PKCE.
export const googleClientSecret = required('GOOGLE_CLIENT_SECRET')

export const microsoftConfig: ProviderConfig = {
  clientId: required('MICROSOFT_CLIENT_ID'),
  // "common" allows both personal Microsoft accounts and work/school accounts.
  authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  scopes: [
    'Mail.Read',
    'Mail.Send',
    'Mail.ReadWrite',
    'User.Read',
    'offline_access',
    'openid',
    'email',
    'profile'
  ]
}

export function assertProviderConfigured(provider: 'google' | 'microsoft'): void {
  if (provider === 'google' && !googleConfig.clientId) {
    throw new Error(
      'GOOGLE_CLIENT_ID is not set. Add it to your .env file (see SETUP_CREDENTIALS.md).'
    )
  }
  if (provider === 'microsoft' && !microsoftConfig.clientId) {
    throw new Error(
      'MICROSOFT_CLIENT_ID is not set. Add it to your .env file (see SETUP_CREDENTIALS.md).'
    )
  }
}
