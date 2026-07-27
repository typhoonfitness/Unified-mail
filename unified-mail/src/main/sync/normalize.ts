// Helpers for normalizing provider data and computing unified thread ids.

import { createHash } from 'crypto'
import type { Address } from '@shared/types'

// Strip leading Re:/Fwd:/Fw: (and localized-ish common variants) and collapse
// whitespace so replies group with their originals.
export function normalizeSubject(subject: string): string {
  let s = (subject ?? '').trim()
  // Repeatedly remove reply/forward prefixes.
  const prefix = /^(re|fwd|fw|aw|wg)\s*(\[\d+\])?\s*:\s*/i
  while (prefix.test(s)) {
    s = s.replace(prefix, '')
  }
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

export function normalizeEmail(email: string): string {
  return (email ?? '').trim().toLowerCase()
}

// A unified thread id that lets a conversation merge across providers.
//
// Strategy: group by normalized subject + the set of participant emails. When
// the subject is empty (rare), fall back to the provider's own thread id so we
// don't collapse unrelated empty-subject messages together.
export function unifiedThreadId(params: {
  subject: string
  participants: string[] // all involved emails (from + to + cc)
  providerThreadId: string
  provider: string
}): string {
  const subj = normalizeSubject(params.subject)
  if (!subj) {
    return sha1(`${params.provider}:${params.providerThreadId}`)
  }
  const people = Array.from(
    new Set(params.participants.map(normalizeEmail).filter(Boolean))
  ).sort()
  return sha1(`${subj}::${people.join(',')}`)
}

function sha1(input: string): string {
  return createHash('sha1').update(input).digest('hex')
}

// Parse a raw RFC 5322 address list like:
//   "Jane Doe" <jane@x.com>, bob@y.com
export function parseAddressList(raw: string | undefined | null): Address[] {
  if (!raw) return []
  const out: Address[] = []
  // Split on commas that are not inside quotes.
  const parts = splitTopLevel(raw)
  for (const part of parts) {
    const addr = parseSingleAddress(part.trim())
    if (addr) out.push(addr)
  }
  return out
}

export function parseSingleAddress(raw: string): Address | null {
  if (!raw) return null
  const angle = raw.match(/^(.*)<([^>]+)>\s*$/)
  if (angle) {
    const name = angle[1].trim().replace(/^"|"$/g, '').trim()
    return { name: name || null, email: angle[2].trim() }
  }
  const email = raw.trim()
  if (!email) return null
  return { name: null, email }
}

function splitTopLevel(raw: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (const ch of raw) {
    if (ch === '"') inQuotes = !inQuotes
    if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) result.push(current)
  return result
}
