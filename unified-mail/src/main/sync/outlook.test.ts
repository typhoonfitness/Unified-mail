import { describe, it, expect } from 'vitest'
import { outlookAdapter } from './outlook'
import { makeFetch, token } from './testUtils'
import type { AdapterContext } from './types'

function graphMessage(id: string, opts: { read?: boolean } = {}) {
  return {
    id,
    conversationId: `conv-${id}`,
    subject: 'Hello world',
    bodyPreview: `preview ${id}`,
    body: { contentType: 'html', content: `<p>body ${id}</p>` },
    from: { emailAddress: { name: 'Bob', address: 'bob@contoso.com' } },
    toRecipients: [{ emailAddress: { name: 'Me', address: 'me@contoso.com' } }],
    receivedDateTime: '2023-11-14T00:00:00Z',
    isRead: opts.read ?? false,
    flag: { flagStatus: 'notFlagged' },
    hasAttachments: false
  }
}

function ctx(fetchImpl: typeof fetch): AdapterContext {
  return {
    accountId: 'microsoft:me@contoso.com',
    getAccessToken: token,
    fetchImpl
  }
}

describe('outlookAdapter.fullSync', () => {
  it('walks the delta feed, normalizes messages, and captures the deltaLink', async () => {
    const { fetchImpl } = makeFetch([
      {
        match: (u) => u.includes('/messages/delta'),
        json: {
          value: [graphMessage('a1', { read: true })],
          '@odata.deltaLink': 'https://graph/delta?token=DELTA1'
        }
      }
    ])

    const result = await outlookAdapter.fullSync(ctx(fetchImpl))

    expect(result.cursor.deltaLink).toBe('https://graph/delta?token=DELTA1')
    expect(result.messages).toHaveLength(1)
    const m = result.messages[0]
    expect(m.provider).toBe('microsoft')
    expect(m.from).toEqual({ name: 'Bob', email: 'bob@contoso.com' })
    expect(m.bodyHtml).toBe('<p>body a1</p>')
    expect(m.isRead).toBe(true)
    expect(m.unifiedThreadId).toMatch(/^[a-f0-9]{40}$/)
  })

  it('follows nextLink pagination before reaching the deltaLink', async () => {
    const { fetchImpl, calls } = makeFetch([
      {
        match: (u) => u.includes('/messages/delta') && !u.includes('page2'),
        json: {
          value: [graphMessage('a1')],
          '@odata.nextLink': 'https://graph/messages/delta?page2'
        }
      },
      {
        match: (u) => u.includes('page2'),
        json: {
          value: [graphMessage('a2')],
          '@odata.deltaLink': 'https://graph/delta?token=DELTA2'
        }
      }
    ])

    const result = await outlookAdapter.fullSync(ctx(fetchImpl))
    expect(result.messages.map((m) => m.providerMessageId)).toEqual(['a1', 'a2'])
    expect(result.cursor.deltaLink).toBe('https://graph/delta?token=DELTA2')
    expect(calls.some((c) => c.includes('page2'))).toBe(true)
  })
})

describe('outlookAdapter.incrementalSync', () => {
  it('requests full resync when there is no deltaLink', async () => {
    const { fetchImpl } = makeFetch([])
    const result = await outlookAdapter.incrementalSync(ctx(fetchImpl), {})
    expect(result).toEqual({ needsFullSync: true })
  })

  it('captures @removed entries as deletions', async () => {
    const { fetchImpl } = makeFetch([
      {
        match: (u) => u.includes('token=DELTA1'),
        json: {
          value: [
            graphMessage('a3'),
            { id: 'a1', '@removed': { reason: 'deleted' } }
          ],
          '@odata.deltaLink': 'https://graph/delta?token=DELTA2'
        }
      }
    ])

    const result = await outlookAdapter.incrementalSync(ctx(fetchImpl), {
      deltaLink: 'https://graph/delta?token=DELTA1'
    })

    if ('needsFullSync' in result) throw new Error('unexpected full sync')
    expect(result.messages.map((m) => m.providerMessageId)).toEqual(['a3'])
    expect(result.deletedProviderMessageIds).toEqual(['a1'])
    expect(result.cursor.deltaLink).toBe('https://graph/delta?token=DELTA2')
  })

  it('falls back to full sync when the delta token is gone (410)', async () => {
    const { fetchImpl } = makeFetch([
      { match: (u) => u.includes('token=OLD'), status: 410, json: {} }
    ])
    const result = await outlookAdapter.incrementalSync(ctx(fetchImpl), {
      deltaLink: 'https://graph/delta?token=OLD'
    })
    expect(result).toEqual({ needsFullSync: true })
  })
})

describe('outlookAdapter mutations', () => {
  it('PATCHes isRead when marking read', async () => {
    let sentBody: string | undefined
    const { fetchImpl } = makeFetch([
      {
        match: (u, init) => {
          if (u.includes('/me/messages/a1')) {
            sentBody = init?.body as string
            return true
          }
          return false
        },
        status: 200,
        json: {}
      }
    ])
    await outlookAdapter.setRead(ctx(fetchImpl), 'a1', true)
    expect(JSON.parse(sentBody!)).toEqual({ isRead: true })
  })
})
