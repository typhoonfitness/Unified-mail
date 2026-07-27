// PKCE (Proof Key for Code Exchange) helpers. Required for public desktop
// OAuth clients so that intercepting the authorization code is not enough to
// obtain tokens.

import { createHash, randomBytes } from 'crypto'

function base64url(input: Buffer): string {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export interface Pkce {
  verifier: string
  challenge: string
  method: 'S256'
}

export function createPkce(): Pkce {
  // 32 random bytes -> 43-char verifier, within the 43..128 spec range.
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge, method: 'S256' }
}

export function randomState(): string {
  return base64url(randomBytes(16))
}
