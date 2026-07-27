// Minimal RFC 5322 / MIME builder for Gmail's users.messages.send, which wants
// a base64url-encoded raw message. Supports an HTML body plus file attachments
// (multipart/mixed), and optional threading headers.

import type { Address } from '@shared/types'
import type { SendAttachment } from '../sync/types'

export interface MimeInput {
  from: Address
  to: Address[]
  cc: Address[]
  bcc: Address[]
  subject: string
  html: string
  attachments: SendAttachment[]
  // Threading headers (replies).
  inReplyTo?: string // original Message-ID
  references?: string[] // full References chain
}

function formatAddress(a: Address): string {
  if (a.name) {
    // Quote display names containing specials.
    const name = /[",<>@]/.test(a.name) ? `"${a.name.replace(/"/g, '\\"')}"` : a.name
    return `${name} <${a.email}>`
  }
  return a.email
}

function formatList(list: Address[]): string {
  return list.map(formatAddress).join(', ')
}

// RFC 2047 encode a header value if it contains non-ASCII.
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`
}

function randomBoundary(): string {
  return `----=_Part_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

export function buildMime(input: MimeInput): string {
  const headers: string[] = []
  headers.push(`From: ${formatAddress(input.from)}`)
  headers.push(`To: ${formatList(input.to)}`)
  if (input.cc.length) headers.push(`Cc: ${formatList(input.cc)}`)
  if (input.bcc.length) headers.push(`Bcc: ${formatList(input.bcc)}`)
  headers.push(`Subject: ${encodeHeader(input.subject)}`)
  headers.push(`MIME-Version: 1.0`)
  headers.push(`Date: ${new Date().toUTCString()}`)
  if (input.inReplyTo) headers.push(`In-Reply-To: ${input.inReplyTo}`)
  if (input.references && input.references.length) {
    headers.push(`References: ${input.references.join(' ')}`)
  }

  const htmlPart =
    `Content-Type: text/html; charset="UTF-8"\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    chunk64(Buffer.from(input.html, 'utf-8').toString('base64'))

  if (input.attachments.length === 0) {
    headers.push(`Content-Type: text/html; charset="UTF-8"`)
    headers.push(`Content-Transfer-Encoding: base64`)
    return (
      headers.join('\r\n') +
      '\r\n\r\n' +
      chunk64(Buffer.from(input.html, 'utf-8').toString('base64'))
    )
  }

  const boundary = randomBoundary()
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)

  const parts: string[] = []
  parts.push(`--${boundary}\r\n${htmlPart}`)
  for (const att of input.attachments) {
    const b64 = chunk64(att.data.toString('base64'))
    parts.push(
      `--${boundary}\r\n` +
        `Content-Type: ${att.mimeType}; name="${att.filename}"\r\n` +
        `Content-Transfer-Encoding: base64\r\n` +
        `Content-Disposition: attachment; filename="${att.filename}"\r\n\r\n` +
        b64
    )
  }
  parts.push(`--${boundary}--`)

  return headers.join('\r\n') + '\r\n\r\n' + parts.join('\r\n')
}

// Wrap base64 at 76 chars per line (RFC 2045).
function chunk64(b64: string): string {
  return b64.replace(/.{76}/g, '$&\r\n')
}

// base64url without padding, as Gmail's `raw` field requires.
export function toBase64Url(raw: string): string {
  return Buffer.from(raw, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
