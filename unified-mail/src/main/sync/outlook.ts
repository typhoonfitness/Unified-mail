// Outlook / Microsoft 365 provider adapter (Microsoft Graph).
//
// Full sync:   GET /me/mailFolders/inbox/messages/delta  (walk to the end;
//              Graph returns a deltaLink cursor for next time)
// Incremental: GET the stored deltaLink
// Mutations:   PATCH /me/messages/{id}  (isRead, flag)
//
// Delta queries give us both the initial page-through and incremental changes
// with one mechanism, including deletions (via @removed).
//
// Docs: https://learn.microsoft.com/graph/delta-query-messages

import { requestJson } from './http'
import { unifiedThreadId } from './normalize'
import type {
  AdapterContext,
  NormalizedMessage,
  ProviderAdapter,
  SyncCursor,
  SyncResult,
  SendPayload,
  SendAttachment
} from './types'
import type { Address, Attachment } from '@shared/types'

const BASE = 'https://graph.microsoft.com/v1.0'
const DEFAULT_FULL_LIMIT = 200

interface GraphRecipient {
  emailAddress?: { name?: string; address?: string }
}

interface GraphMessage {
  id: string
  conversationId?: string
  subject?: string
  bodyPreview?: string
  body?: { contentType?: 'html' | 'text'; content?: string }
  from?: GraphRecipient
  sender?: GraphRecipient
  toRecipients?: GraphRecipient[]
  ccRecipients?: GraphRecipient[]
  receivedDateTime?: string
  isRead?: boolean
  flag?: { flagStatus?: 'notFlagged' | 'flagged' | 'complete' }
  hasAttachments?: boolean
  parentFolderId?: string
  internetMessageHeaders?: Array<{ name: string; value: string }>
  '@removed'?: { reason: string }
}

interface GraphDeltaResponse {
  value: GraphMessage[]
  '@odata.nextLink'?: string
  '@odata.deltaLink'?: string
}

function toAddress(r: GraphRecipient | undefined): Address | null {
  const e = r?.emailAddress
  if (!e?.address) return null
  return { name: e.name ?? null, email: e.address }
}

function toAddresses(list: GraphRecipient[] | undefined): Address[] {
  return (list ?? [])
    .map(toAddress)
    .filter((a): a is Address => a !== null)
}

function toNormalized(
  accountId: string,
  msg: GraphMessage
): NormalizedMessage {
  const from = toAddress(msg.from) ?? toAddress(msg.sender)
  const to = toAddresses(msg.toRecipients)
  const cc = toAddresses(msg.ccRecipients)
  const subject = msg.subject ?? ''
  const isHtml = msg.body?.contentType === 'html'
  const content = msg.body?.content ?? null

  const participants = [
    ...(from ? [from.email] : []),
    ...to.map((a) => a.email),
    ...cc.map((a) => a.email)
  ]

  const providerThreadId = msg.conversationId ?? msg.id

  return {
    accountId,
    provider: 'microsoft',
    providerMessageId: msg.id,
    providerThreadId,
    unifiedThreadId: unifiedThreadId({
      subject,
      participants,
      providerThreadId,
      provider: 'microsoft'
    }),
    from,
    to,
    cc,
    subject,
    snippet: msg.bodyPreview ?? '',
    bodyHtml: isHtml ? content : null,
    bodyText: isHtml ? null : content,
    receivedAt: msg.receivedDateTime
      ? Date.parse(msg.receivedDateTime)
      : Date.now(),
    isRead: msg.isRead ?? false,
    isStarred: msg.flag?.flagStatus === 'flagged',
    folder: 'inbox',
    labels: [],
    hasAttachments: msg.hasAttachments ?? false,
    // Attachment metadata is fetched lazily via listAttachments() to keep sync
    // fast; the reading pane hydrates it when a message is opened.
    attachments: [],
    bulk: (msg.internetMessageHeaders ?? []).some(
      (h) => h.name.toLowerCase() === 'list-unsubscribe'
    ),
    unsubscribe:
      (msg.internetMessageHeaders ?? []).find(
        (h) => h.name.toLowerCase() === 'list-unsubscribe'
      )?.value ?? null
  }
}

// The fields we request; keeps payloads small and predictable.
const SELECT =
  '$select=id,conversationId,subject,bodyPreview,body,from,sender,' +
  'toRecipients,ccRecipients,receivedDateTime,isRead,flag,hasAttachments,' +
  'parentFolderId,internetMessageHeaders'

async function walkDelta(
  ctx: AdapterContext,
  startUrl: string,
  limit: number
): Promise<SyncResult> {
  const token = await ctx.getAccessToken()
  const messages: NormalizedMessage[] = []
  const deleted: string[] = []
  let url: string | undefined = startUrl
  let deltaLink: string | undefined

  while (url) {
    const page: GraphDeltaResponse = await requestJson<GraphDeltaResponse>(url, {
      accessToken: token,
      fetchImpl: ctx.fetchImpl,
      // Graph delta prefers immutable ids + this odata preference header.
      headers: { Prefer: 'IdType="ImmutableId"' }
    })

    for (const m of page.value ?? []) {
      if (m['@removed']) {
        deleted.push(m.id)
      } else {
        const norm = toNormalized(ctx.accountId, m)
        // Skip empty placeholder/system items (no sender, subject, or preview)
        // — these show up as "(no sender) / (no subject)" rows.
        if (norm.from || norm.subject.trim() || norm.snippet.trim()) {
          messages.push(norm)
        }
      }
    }

    if (page['@odata.deltaLink']) {
      deltaLink = page['@odata.deltaLink']
      break
    }
    url = page['@odata.nextLink']
    if (messages.length >= limit) {
      // Stop early on a huge first sync; we still need a deltaLink, so keep
      // following nextLink only until we get one. Graph returns deltaLink on
      // the final page, so if we hit the cap we continue but stop adding.
      // To bound work, break and force a fresh full sync next time if no
      // deltaLink was captured.
      if (deltaLink) break
    }
  }

  return {
    messages,
    deletedProviderMessageIds: deleted,
    cursor: { deltaLink: deltaLink ?? null }
  }
}

export const outlookAdapter: ProviderAdapter = {
  async fullSync(ctx: AdapterContext): Promise<SyncResult> {
    const limit = ctx.fullSyncLimit ?? DEFAULT_FULL_LIMIT
    const start = `${BASE}/me/mailFolders/inbox/messages/delta?${SELECT}&$top=50`
    const result = await walkDelta(ctx, start, limit)
    // If we never captured a deltaLink (extremely large mailbox capped early),
    // the engine will simply run another full sync next cycle.
    return result
  },

  async incrementalSync(
    ctx: AdapterContext,
    cursor: SyncCursor
  ): Promise<SyncResult | { needsFullSync: true }> {
    if (!cursor.deltaLink) return { needsFullSync: true }
    try {
      return await walkDelta(ctx, cursor.deltaLink, Number.MAX_SAFE_INTEGER)
    } catch (err) {
      const status = (err as { status?: number }).status
      // 410 Gone => delta token expired; resync fully.
      if (status === 410) return { needsFullSync: true }
      throw err
    }
  },

  async setRead(ctx, providerMessageId, read): Promise<void> {
    const token = await ctx.getAccessToken()
    await requestJson(`${BASE}/me/messages/${providerMessageId}`, {
      method: 'PATCH',
      accessToken: token,
      fetchImpl: ctx.fetchImpl,
      body: JSON.stringify({ isRead: read })
    })
  },

  async setStarred(ctx, providerMessageId, starred): Promise<void> {
    const token = await ctx.getAccessToken()
    await requestJson(`${BASE}/me/messages/${providerMessageId}`, {
      method: 'PATCH',
      accessToken: token,
      fetchImpl: ctx.fetchImpl,
      body: JSON.stringify({
        flag: { flagStatus: starred ? 'flagged' : 'notFlagged' }
      })
    })
  },

  async archive(ctx, providerMessageId): Promise<void> {
    const token = await ctx.getAccessToken()
    // Move to the well-known Archive folder.
    await requestJson(`${BASE}/me/messages/${providerMessageId}/move`, {
      method: 'POST',
      accessToken: token,
      fetchImpl: ctx.fetchImpl,
      body: JSON.stringify({ destinationId: 'archive' })
    })
  },

  async trash(ctx, providerMessageId): Promise<void> {
    const token = await ctx.getAccessToken()
    await requestJson(`${BASE}/me/messages/${providerMessageId}/move`, {
      method: 'POST',
      accessToken: token,
      fetchImpl: ctx.fetchImpl,
      body: JSON.stringify({ destinationId: 'deleteditems' })
    })
  },

  async listAttachments(ctx, providerMessageId): Promise<Attachment[]> {
    const token = await ctx.getAccessToken()
    const res = await requestJson<{
      value: Array<{
        id: string
        name?: string
        contentType?: string
        size?: number
      }>
    }>(
      `${BASE}/me/messages/${providerMessageId}/attachments?$select=id,name,contentType,size`,
      { accessToken: token, fetchImpl: ctx.fetchImpl }
    )
    return (res.value ?? []).map((a) => ({
      id: a.id,
      filename: a.name ?? 'attachment',
      mimeType: a.contentType ?? 'application/octet-stream',
      size: a.size ?? 0
    }))
  },

  async downloadAttachment(
    ctx,
    providerMessageId,
    attachmentId
  ): Promise<{ filename: string; mimeType: string; data: Buffer }> {
    const token = await ctx.getAccessToken()
    // fileAttachment resources carry base64 contentBytes.
    const att = await requestJson<{
      name?: string
      contentType?: string
      contentBytes?: string
    }>(`${BASE}/me/messages/${providerMessageId}/attachments/${attachmentId}`, {
      accessToken: token,
      fetchImpl: ctx.fetchImpl
    })
    return {
      filename: att.name ?? 'attachment',
      mimeType: att.contentType ?? 'application/octet-stream',
      data: Buffer.from(att.contentBytes ?? '', 'base64')
    }
  },

  async send(ctx, payload: SendPayload): Promise<void> {
    const token = await ctx.getAccessToken()

    if (!payload.reply) {
      // New message: single sendMail call with inline attachments.
      await requestJson(`${BASE}/me/sendMail`, {
        method: 'POST',
        accessToken: token,
        fetchImpl: ctx.fetchImpl,
        body: JSON.stringify({
          message: {
            subject: payload.subject,
            body: { contentType: 'HTML', content: payload.html },
            toRecipients: toGraphRecipients(payload.to),
            ccRecipients: toGraphRecipients(payload.cc),
            bccRecipients: toGraphRecipients(payload.bcc),
            attachments: payload.attachments.map(toGraphAttachment)
          },
          saveToSentItems: true
        })
      })
      return
    }

    // Reply / reply-all / forward: create a conversation-linked draft, overwrite
    // its content with our composed body/recipients, attach files, then send.
    const verb =
      payload.reply.mode === 'forward'
        ? 'createForward'
        : payload.reply.mode === 'replyAll'
          ? 'createReplyAll'
          : 'createReply'

    const draft = await requestJson<{ id: string }>(
      `${BASE}/me/messages/${payload.reply.providerMessageId}/${verb}`,
      { method: 'POST', accessToken: token, fetchImpl: ctx.fetchImpl }
    )

    await requestJson(`${BASE}/me/messages/${draft.id}`, {
      method: 'PATCH',
      accessToken: token,
      fetchImpl: ctx.fetchImpl,
      body: JSON.stringify({
        body: { contentType: 'HTML', content: payload.html },
        toRecipients: toGraphRecipients(payload.to),
        ccRecipients: toGraphRecipients(payload.cc),
        bccRecipients: toGraphRecipients(payload.bcc)
      })
    })

    for (const att of payload.attachments) {
      await requestJson(`${BASE}/me/messages/${draft.id}/attachments`, {
        method: 'POST',
        accessToken: token,
        fetchImpl: ctx.fetchImpl,
        body: JSON.stringify(toGraphAttachment(att))
      })
    }

    await requestJson(`${BASE}/me/messages/${draft.id}/send`, {
      method: 'POST',
      accessToken: token,
      fetchImpl: ctx.fetchImpl
    })
  }
}

function toGraphRecipients(list: Address[]): GraphRecipient[] {
  return list.map((a) => ({
    emailAddress: { address: a.email, name: a.name ?? undefined }
  }))
}

function toGraphAttachment(att: SendAttachment): Record<string, unknown> {
  return {
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: att.filename,
    contentType: att.mimeType,
    contentBytes: att.data.toString('base64')
  }
}
