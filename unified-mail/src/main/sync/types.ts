// Internal types for the sync layer.

import type { Address, Attachment, ComposeMode, Message } from '@shared/types'

// A normalized message ready to be written to the store. It is a Message minus
// the synthetic primary key (`id`), which the store derives from
// accountId + providerMessageId. The adapters compute unifiedThreadId.
export type NormalizedMessage = Omit<Message, 'id'>

// Result of a sync pass for one account.
export interface SyncResult {
  messages: NormalizedMessage[]
  deletedProviderMessageIds: string[]
  // New cursor to persist for the next incremental sync.
  cursor: SyncCursor
}

export interface SyncCursor {
  historyId?: string | null // Gmail
  deltaLink?: string | null // Outlook
}

export interface AdapterContext {
  accountId: string
  // Returns a currently-valid access token, refreshing if needed.
  getAccessToken: () => Promise<string>
  // Injectable fetch for tests.
  fetchImpl?: typeof fetch
  // Cap for the initial full sync so first connect stays fast & within quota.
  fullSyncLimit?: number
}

export interface ProviderAdapter {
  // First sync: pull the most recent messages and return a fresh cursor.
  fullSync: (ctx: AdapterContext) => Promise<SyncResult>
  // Subsequent syncs: apply changes since the stored cursor. If the cursor is
  // stale/expired, the adapter should signal a full resync by returning
  // cursor with a special empty marker (engine falls back to fullSync).
  incrementalSync: (
    ctx: AdapterContext,
    cursor: SyncCursor
  ) => Promise<SyncResult | { needsFullSync: true }>
  // Remote mutations used by the IPC action handlers.
  setRead: (
    ctx: AdapterContext,
    providerMessageId: string,
    read: boolean
  ) => Promise<void>
  setStarred: (
    ctx: AdapterContext,
    providerMessageId: string,
    starred: boolean
  ) => Promise<void>
  // Remove from inbox (keep the message).
  archive: (ctx: AdapterContext, providerMessageId: string) => Promise<void>
  // Move to trash.
  trash: (ctx: AdapterContext, providerMessageId: string) => Promise<void>
  // Fetch attachment metadata for a message.
  listAttachments: (
    ctx: AdapterContext,
    providerMessageId: string
  ) => Promise<Attachment[]>
  // Fetch attachment bytes.
  downloadAttachment: (
    ctx: AdapterContext,
    providerMessageId: string,
    attachmentId: string
  ) => Promise<{ filename: string; mimeType: string; data: Buffer }>
  // Send a message (new, reply, reply-all, or forward).
  send: (ctx: AdapterContext, payload: SendPayload) => Promise<void>
}

export interface SendAttachment {
  filename: string
  mimeType: string
  data: Buffer
}

export interface ReplyMeta {
  providerMessageId: string
  providerThreadId: string
  mode: ComposeMode
}

export interface SendPayload {
  from: Address
  to: Address[]
  cc: Address[]
  bcc: Address[]
  subject: string
  html: string
  attachments: SendAttachment[]
  // Present for reply/replyAll/forward so the provider can thread correctly.
  reply?: ReplyMeta
}
