import { describe, it, expect } from 'vitest'
import { buildMime, toBase64Url } from './mime'
import type { SendAttachment } from '../sync/types'

const base = {
  from: { name: 'Me', email: 'me@example.com' },
  to: [{ name: 'Jane Doe', email: 'jane@example.com' }],
  cc: [],
  bcc: [],
  subject: 'Hello',
  html: '<p>Hi there</p>',
  attachments: [] as SendAttachment[]
}

describe('buildMime', () => {
  it('produces a simple html message with correct headers', () => {
    const mime = buildMime(base)
    expect(mime).toContain('From: Me <me@example.com>')
    expect(mime).toContain('To: Jane Doe <jane@example.com>')
    expect(mime).toContain('Subject: Hello')
    expect(mime).toContain('Content-Type: text/html; charset="UTF-8"')
    // Body is base64 of the HTML.
    expect(mime).toContain(
      Buffer.from('<p>Hi there</p>', 'utf-8').toString('base64')
    )
  })

  it('adds threading headers for replies', () => {
    const mime = buildMime({
      ...base,
      inReplyTo: '<orig@mail.example>',
      references: ['<a@mail>', '<orig@mail.example>']
    })
    expect(mime).toContain('In-Reply-To: <orig@mail.example>')
    expect(mime).toContain('References: <a@mail> <orig@mail.example>')
  })

  it('builds a multipart/mixed message when attachments are present', () => {
    const att: SendAttachment = {
      filename: 'notes.txt',
      mimeType: 'text/plain',
      data: Buffer.from('file contents', 'utf-8')
    }
    const mime = buildMime({ ...base, attachments: [att] })
    expect(mime).toContain('Content-Type: multipart/mixed; boundary=')
    expect(mime).toContain('Content-Disposition: attachment; filename="notes.txt"')
    expect(mime).toContain(Buffer.from('file contents', 'utf-8').toString('base64'))
  })

  it('RFC 2047 encodes a non-ASCII subject', () => {
    const mime = buildMime({ ...base, subject: 'Café ☕' })
    expect(mime).toContain('Subject: =?UTF-8?B?')
  })

  it('toBase64Url is url-safe and unpadded', () => {
    const out = toBase64Url('>>>???')
    expect(out).not.toMatch(/[+/=]/)
  })
})
