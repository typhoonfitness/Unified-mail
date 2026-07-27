import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import { createPkce, randomState } from './pkce'

function base64url(input: Buffer): string {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

describe('PKCE', () => {
  it('produces a verifier within the RFC 7636 length range', () => {
    const { verifier } = createPkce()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
  })

  it('uses URL-safe characters only (no + / =)', () => {
    const { verifier, challenge } = createPkce()
    expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/)
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/)
  })

  it('challenge is the S256 hash of the verifier', () => {
    const { verifier, challenge, method } = createPkce()
    expect(method).toBe('S256')
    const expected = base64url(createHash('sha256').update(verifier).digest())
    expect(challenge).toBe(expected)
  })

  it('generates unique verifiers and states', () => {
    const a = createPkce().verifier
    const b = createPkce().verifier
    expect(a).not.toBe(b)
    expect(randomState()).not.toBe(randomState())
  })
})
