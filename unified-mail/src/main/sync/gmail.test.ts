import { describe, it, expect } from 'vitest'
import { gmailAdapter } from './gmail'
import { makeFetch, token } from './testUtils'
import type { AdapterContext } from './types'

function b64url(s: string): string {
  return Buffer.from(s, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function gmailMessage(id: string, opts: { unread?: boolean } = {}) {
  return {
    id,
    threadId: `thread-${id}`,
    labelIds: ['INBOX', ...(opts.unread ? ['UNREAD'] : [])],
    snippet: `snippet ${id}`,
    internalDate: '1700000000000',
    payload: {
      mimeType: 'multipart/alternative',
      headers: [
        { name: 'From', value: 'Jane Doe <jane@example.com>' },
        { name: 'To', value: 'me@example.com' },
        { name: 'Subject', value: 'Hello world' }
      ],
      parts: [
        {
          mimeType: 'text/plain',
          body: { data: b64url('plain body') }
        },
        {
          mimeType: 'text/html',
          body: { data: b64url('<p>html body</p>') }
        }
      ]
    }
  }
}

function ctx(fetchImpl: typeof fetch): AdapterContext {
  return { accountId: 'google:me@example.com', getAccessToken: token, fetchImpl }
}

describe('gmailAdapter.fullSync', () => {
  it('lists, hydrates, and normalizes messages with a fresh historyId', async () => {
    const { fetchImpl } = makeFetch([
      {
        match: (u) => u.includes('/messages?') || u.includes('/messages&'),
        json: { messages: [{ id: 'm1', threadId: 't1' }] }
      },
      {
        match: (u) => u.includes('/messages/m1'),
        json: gmailMessage('m1', { unread: true })
      },
      {
        match: (u) => u.endsWith('/profile'),
        json: { historyId: '9999' }
      }
    ])

    const result = await gmailAdapter.fullSync(ctx(fetchImpl))

    expect(result.cursor.historyId).toBe('9999')
    expect(result.messages).toHaveLength(1)
    const m = result.messages[0]
    expect(m.provider).toBe('google')
    expect(m.from).toEqual({ name: 'Jane Doe', email: 'jane@example.com' })
    expect(m.subject).toBe('Hello world')
    expect(m.bodyText).toBe('plain body')
    expect(m.bodyHtml).toBe('<p>html body</p>')
    expect(m.isRead).toBe(false) // UNREAD label present
    expect(m.folder).toBe('inbox')
    expect(m.unifiedThreadId).toMatch(/^[a-f0-9]{40}$/)
  })
})

describe('gmailAdapter.incrementalSync', () => {
  it('requests full resync when there is no cursor', async () => {
    const { fetchImpl } = makeFetch([])
    const result = await gmailAdapter.incrementalSync(ctx(fetchImpl), {})
    expect(result).toEqual({ needsFullSync: true })
  })

  it('collects changed ids from history and hydrates them', async () => {
    const { fetchImpl, calls } = makeFetch([
      {
        match: (u) => u.includes('/history'),
        json: {
          history: [
            { messagesAdded: [{ message: { id: 'm2', threadId: 't2' } }] }
          ],
          historyId: '10001'
        }
      },
      {
        match: (u) => u.includes('/messages/m2'),
        json: gmailMessage('m2')
      }
    ])

    const result = await gmailAdapter.incrementalSync(ctx(fetchImpl), {
      historyId: '10000'
    })

    if ('needsFullSync' in result) throw new Error('unexpected full sync')
    expect(result.cursor.historyId).toBe('10001')
    expect(result.messages.map((m) => m.providerMessageId)).toEqual(['m2'])
    expect(calls.some((c) => c.includes('startHistoryId=10000'))).toBe(true)
  })

  it('falls back to full sync when history cursor is expired (404)', async () => {
    const { fetchImpl } = makeFetch([
      { match: (u) => u.includes('/history'), status: 404, json: {} }
    ])
    const result = await gmailAdapter.incrementalSync(ctx(fetchImpl), {
      historyId: '1'
    })
    expect(result).toEqual({ needsFullSync: true })
  })
})

describe('gmailAdapter mutations', () => {
  it('removes UNREAD when marking read', async () => {
    let sentBody: string | undefined
    const { fetchImpl } = makeFetch([
      {
        match: (u, init) => {
          if (u.includes('/modify')) {
            sentBody = init?.body as string
            return true
          }
          return false
        },
        json: {}
      }
    ])
    await gmailAdapter.setRead(ctx(fetchImpl), 'm1', true)
    expect(JSON.parse(sentBody!)).toEqual({ removeLabelIds: ['UNREAD'] })
  })
})
