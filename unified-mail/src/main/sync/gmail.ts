// Gmail provider adapter.
//
// Full sync:  users.messages.list (paginated) -> users.messages.get (format=full)
// Incremental: users.history.list from the stored historyId
// Mutations:  users.messages.modify (labels: UNREAD, STARRED)
//
// Docs: https://developers.google.com/gmail/api/reference/rest

import { requestJson } from './http'
import {
  parseAddressList,
  parseSingleAddress,
  unifiedThreadId
} from './normalize'
import type {
  AdapterContext,
  NormalizedMessage,
  ProviderAdapter,
  SyncCursor,
  SyncResult,
  SendPayload
} from './types'
import type { Attachment } from '@shared/types'
import { buildMime, toBase64Url } from '../compose/mime'

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const DEFAULT_FULL_LIMIT = 200

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>
  nextPageToken?: string
  resultSizeEstimate?: number
}

interface GmailHeader {
  name: string
  value: string
}

interface GmailPart {
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: { data?: string; size?: number; attachmentId?: string }
  parts?: GmailPart[]
}

interface GmailMessage {
  id: string
  threadId: string
  labelIds?: string[]
  snippet?: string
  internalDate?: string // ms since epoch, as string
  payload?: GmailPart
}

interface GmailHistoryResponse {
  history?: Array<{
    messagesAdded?: Array<{ message: { id: string; threadId: string } }>
    messagesDeleted?: Array<{ message: { id: string; threadId: string } }>
    labelsAdded?: Array<{ message: { id: string; threadId: string } }>
    labelsRemoved?: Array<{ message: { id: string; threadId: string } }>
  }>
  historyId?: string
  nextPageToken?: string
}

interface GmailProfile {
  historyId: string
}

function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  const h = headers?.find((x) => x.name.toLowerCase() === name.toLowerCase())
  return h?.value ?? ''
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(normalized, 'base64').toString('utf-8')
}

// Walk the MIME tree collecting text/plain, text/html, and attachments.
function extractBodies(payload: GmailPart | undefined): {
  html: string | null
  text: string | null
  attachments: Attachment[]
} {
  let html: string | null = null
  let text: string | null = null
  const attachments: Attachment[] = []

  const walk = (part: GmailPart | undefined): void => {
    if (!part) return
    const mime = part.mimeType ?? ''
    if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
      attachments.push({
        id: part.body.attachmentId,
        filename: part.filename,
        mimeType: mime || 'application/octet-stream',
        size: part.body.size ?? 0
      })
    }
    if (mime === 'text/html' && part.body?.data && html === null) {
      html = decodeBase64Url(part.body.data)
    } else if (mime === 'text/plain' && part.body?.data && text === null) {
      text = decodeBase64Url(part.body.data)
    }
    part.parts?.forEach(walk)
  }
  walk(payload)
  return { html, text, attachments }
}

function toNormalized(
  accountId: string,
  msg: GmailMessage
): NormalizedMessage {
  const headers = msg.payload?.headers
  const from = parseSingleAddress(headerValue(headers, 'From'))
  const to = parseAddressList(headerValue(headers, 'To'))
  const cc = parseAddressList(headerValue(headers, 'Cc'))
  const subject = headerValue(headers, 'Subject')
  const { html, text, attachments } = extractBodies(msg.payload)
  const labels = msg.labelIds ?? []

  const receivedAt = msg.internalDate
    ? Number(msg.internalDate)
    : Date.parse(headerValue(headers, 'Date')) || Date.now()

  // Derive a simple folder from labels for the unified sidebar.
  const folder = labels.includes('SENT')
    ? 'sent'
    : labels.includes('TRASH')
      ? 'trash'
      : labels.includes('DRAFT')
        ? 'drafts'
        : labels.includes('INBOX')
          ? 'inbox'
          : 'all'

  return {
    accountId,
    provider: 'google',
    providerMessageId: msg.id,
    providerThreadId: msg.threadId,
    from,
    to,
    cc,
    subject,
    snippet: msg.snippet ?? '',
    bodyHtml: html,
    bodyText: text,
    receivedAt,
    isRead: !labels.includes('UNREAD'),
    isStarred: labels.includes('STARRED'),
    folder,
    labels,
    hasAttachments: attachments.length > 0,
    attachments,
    bulk:
      headerValue(headers, 'List-Unsubscribe') !== '' ||
      labels.some((l) =>
        [
          'CATEGORY_PROMOTIONS',
          'CATEGORY_SOCIAL',
          'CATEGORY_UPDATES',
          'CATEGORY_FORUMS'
        ].includes(l)
      ),
    unsubscribe: headerValue(headers, 'List-Unsubscribe') || null,
    // unifiedThreadId is attached by the caller via attachThreadId()
  } as NormalizedMessage
}

function attachThreadId(m: NormalizedMessage): NormalizedMessage {
  const participants = [
    ...(m.from ? [m.from.email] : []),
    ...m.to.map((a) => a.email),
    ...m.cc.map((a) => a.email)
  ]
  return {
    ...m,
    unifiedThreadId: unifiedThreadId({
      subject: m.subject,
      participants,
      providerThreadId: m.providerThreadId,
      provider: 'google'
    })
  } as NormalizedMessage
}

async function getMessage(
  ctx: AdapterContext,
  token: string,
  id: string
): Promise<GmailMessage> {
  return requestJson<GmailMessage>(
    `${BASE}/messages/${id}?format=full`,
    { accessToken: token, fetchImpl: ctx.fetchImpl }
  )
}

async function hydrate(
  ctx: AdapterContext,
  token: string,
  ids: string[]
): Promise<NormalizedMessage[]> {
  const out: NormalizedMessage[] = []
  // Serial with small batches keeps us well under Gmail's per-user rate limit;
  // http.ts handles any 429 backoff.
  for (const id of ids) {
    try {
      const full = await getMessage(ctx, token, id)
      out.push(attachThreadId(toNormalized(ctx.accountId, full)))
    } catch {
      // Skip messages that vanished between list and get.
    }
  }
  return out
}

export const gmailAdapter: ProviderAdapter = {
  async fullSync(ctx: AdapterContext): Promise<SyncResult> {
    const token = await ctx.getAccessToken()
    const limit = ctx.fullSyncLimit ?? DEFAULT_FULL_LIMIT

    const ids: string[] = []
    let pageToken: string | undefined
    do {
      const url = new URL(`${BASE}/messages`)
      url.searchParams.set('maxResults', String(Math.min(100, limit)))
      url.searchParams.set('q', 'in:inbox')
      if (pageToken) url.searchParams.set('pageToken', pageToken)
      const page = await requestJson<GmailListResponse>(url.toString(), {
        accessToken: token,
        fetchImpl: ctx.fetchImpl
      })
      for (const m of page.messages ?? []) {
        ids.push(m.id)
        if (ids.length >= limit) break
      }
      pageToken = ids.length >= limit ? undefined : page.nextPageToken
    } while (pageToken)

    const messages = await hydrate(ctx, token, ids)

    // Current historyId to start future incremental syncs from.
    const profile = await requestJson<GmailProfile>(`${BASE}/profile`, {
      accessToken: token,
      fetchImpl: ctx.fetchImpl
    })

    return {
      messages,
      deletedProviderMessageIds: [],
      cursor: { historyId: profile.historyId }
    }
  },

  async incrementalSync(
    ctx: AdapterContext,
    cursor: SyncCursor
  ): Promise<SyncResult | { needsFullSync: true }> {
    if (!cursor.historyId) return { needsFullSync: true }
    const token = await ctx.getAccessToken()

    const changedIds = new Set<string>()
    const deletedIds = new Set<string>()
    let pageToken: string | undefined
    let newHistoryId: string | undefined = cursor.historyId

    try {
      do {
        const url = new URL(`${BASE}/history`)
        url.searchParams.set('startHistoryId', cursor.historyId)
        if (pageToken) url.searchParams.set('pageToken', pageToken)
        const page = await requestJson<GmailHistoryResponse>(url.toString(), {
          accessToken: token,
          fetchImpl: ctx.fetchImpl
        })
        for (const h of page.history ?? []) {
          h.messagesAdded?.forEach((x) => changedIds.add(x.message.id))
          h.labelsAdded?.forEach((x) => changedIds.add(x.message.id))
          h.labelsRemoved?.forEach((x) => changedIds.add(x.message.id))
          h.messagesDeleted?.forEach((x) => deletedIds.add(x.message.id))
        }
        if (page.historyId) newHistoryId = page.historyId
        pageToken = page.nextPageToken
      } while (pageToken)
    } catch (err) {
      // A 404 means the startHistoryId is too old; do a full resync.
      const status = (err as { status?: number }).status
      if (status === 404) return { needsFullSync: true }
      throw err
    }

    // Do not re-fetch messages that were deleted.
    deletedIds.forEach((id) => changedIds.delete(id))
    const messages = await hydrate(ctx, token, [...changedIds])

    return {
      messages,
      deletedProviderMessageIds: [...deletedIds],
      cursor: { historyId: newHistoryId }
    }
  },

  async setRead(ctx, providerMessageId, read): Promise<void> {
    const token = await ctx.getAccessToken()
    await requestJson(`${BASE}/messages/${providerMessageId}/modify`, {
      method: 'POST',
      accessToken: token,
      fetchImpl: ctx.fetchImpl,
      body: JSON.stringify(
        read ? { removeLabelIds: ['UNREAD'] } : { addLabelIds: ['UNREAD'] }
      )
    })
  },

  async setStarred(ctx, providerMessageId, starred): Promise<void> {
    const token = await ctx.getAccessToken()
    await requestJson(`${BASE}/messages/${providerMessageId}/modify`, {
      method: 'POST',
      accessToken: token,
      fetchImpl: ctx.fetchImpl,
      body: JSON.stringify(
        starred ? { addLabelIds: ['STARRED'] } : { removeLabelIds: ['STARRED'] }
      )
    })
  },

  async archive(ctx, providerMessageId): Promise<void> {
    const token = await ctx.getAccessToken()
    // Archiving in Gmail = removing the INBOX label.
    await requestJson(`${BASE}/messages/${providerMessageId}/modify`, {
      method: 'POST',
      accessToken: token,
      fetchImpl: ctx.fetchImpl,
      body: JSON.stringify({ removeLabelIds: ['INBOX'] })
    })
  },

  async trash(ctx, providerMessageId): Promise<void> {
    const token = await ctx.getAccessToken()
    await requestJson(`${BASE}/messages/${providerMessageId}/trash`, {
      method: 'POST',
      accessToken: token,
      fetchImpl: ctx.fetchImpl
    })
  },

  async listAttachments(ctx, providerMessageId): Promise<Attachment[]> {
    // Gmail returns attachment metadata within the message payload, so a full
    // get gives us everything we need without a separate endpoint.
    const token = await ctx.getAccessToken()
    const full = await getMessage(ctx, token, providerMessageId)
    return extractBodies(full.payload).attachments
  },

  async downloadAttachment(
    ctx,
    providerMessageId,
    attachmentId
  ): Promise<{ filename: string; mimeType: string; data: Buffer }> {
    const token = await ctx.getAccessToken()
    // Resolve filename/mime from the message payload.
    const full = await getMessage(ctx, token, providerMessageId)
    const meta = extractBodies(full.payload).attachments.find(
      (a) => a.id === attachmentId
    )
    const body = await requestJson<{ data?: string; size?: number }>(
      `${BASE}/messages/${providerMessageId}/attachments/${attachmentId}`,
      { accessToken: token, fetchImpl: ctx.fetchImpl }
    )
    const data = Buffer.from(
      (body.data ?? '').replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    )
    return {
      filename: meta?.filename ?? 'attachment',
      mimeType: meta?.mimeType ?? 'application/octet-stream',
      data
    }
  },

  async send(ctx, payload: SendPayload): Promise<void> {
    const token = await ctx.getAccessToken()

    let inReplyTo: string | undefined
    let references: string[] | undefined
    let threadId: string | undefined

    if (payload.reply) {
      threadId = payload.reply.providerThreadId
      // Fetch the original to obtain its RFC Message-ID + References chain so
      // the reply threads correctly in all mail clients.
      try {
        const orig = await requestJson<GmailMessage>(
          `${BASE}/messages/${payload.reply.providerMessageId}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`,
          { accessToken: token, fetchImpl: ctx.fetchImpl }
        )
        const headers = orig.payload?.headers
        const msgId = headerValue(headers, 'Message-ID')
        const refs = headerValue(headers, 'References')
        if (msgId) {
          inReplyTo = msgId
          references = [...(refs ? refs.split(/\s+/) : []), msgId]
        }
      } catch {
        // Non-fatal: send without threading headers.
      }
    }

    const raw = toBase64Url(
      buildMime({
        from: payload.from,
        to: payload.to,
        cc: payload.cc,
        bcc: payload.bcc,
        subject: payload.subject,
        html: payload.html,
        attachments: payload.attachments,
        inReplyTo,
        references
      })
    )

    await requestJson(`${BASE}/messages/send`, {
      method: 'POST',
      accessToken: token,
      fetchImpl: ctx.fetchImpl,
      body: JSON.stringify(threadId ? { raw, threadId } : { raw })
    })
  }
}
