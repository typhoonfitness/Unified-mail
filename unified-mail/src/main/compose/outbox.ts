// Local send queue with an undo window, retry/backoff, and status broadcast.
//
// Flow:
//   enqueue(draft) -> resolve a JSON-serializable "send plan" -> insert an
//   outbox row (status=pending, send_after = now + UNDO_MS). A periodic tick
//   picks up due rows, reads attachment bytes, calls the provider adapter, and
//   marks sent/failed. Failures retry with exponential backoff up to a cap.

import { randomUUID } from 'crypto'
import { readFile } from 'fs/promises'
import { BrowserWindow } from 'electron'
import type {
  Address,
  Draft,
  OutboxItem,
  OutboxStatus,
  Provider
} from '@shared/types'
import { getDb } from '../db'
import { getSettings } from '../settings/settingsStore'
import { getValidAccessToken, listConnectedAccounts } from '../auth/session'
import { gmailAdapter } from '../sync/gmail'
import { outlookAdapter } from '../sync/outlook'
import { parseAddressList } from '../sync/normalize'
import { getMessageRoute, getMessageById } from '../sync/store'
import { deleteDraft } from './draftStore'
import type {
  AdapterContext,
  ProviderAdapter,
  ReplyMeta,
  SendAttachment,
  SendPayload
} from '../sync/types'

export const UNDO_MS = 10_000 // fallback if settings are unavailable
const MAX_ATTEMPTS = 5
const TICK_MS = 1_000

// The configured undo window in ms (clamped 0..30s). Read fresh each send.
function undoWindowMs(): number {
  try {
    const s = getSettings().undoSendSeconds
    if (typeof s !== 'number' || Number.isNaN(s)) return UNDO_MS
    return Math.max(0, Math.min(30, s)) * 1_000
  } catch {
    return UNDO_MS
  }
}

interface PlanAttachment {
  path: string
  filename: string
  mimeType: string
}

// A JSON-serializable resolved send plan (no Buffers). Attachment bytes are
// read from disk at send time.
interface SendPlan {
  from: Address
  to: Address[]
  cc: Address[]
  bcc: Address[]
  subject: string
  html: string
  attachments: PlanAttachment[]
  reply?: ReplyMeta
}

function adapterFor(provider: Provider): ProviderAdapter {
  return provider === 'google' ? gmailAdapter : outlookAdapter
}

function ctxFor(accountId: string): AdapterContext {
  return { accountId, getAccessToken: () => getValidAccessToken(accountId) }
}

function fromAddressFor(accountId: string): Address {
  const acc = listConnectedAccounts().find((a) => a.id === accountId)
  return { name: acc?.displayName ?? null, email: acc?.email ?? '' }
}

// Build the resolved plan from a draft (recipients parsed, reply target routed).
function resolvePlan(draft: Draft): SendPlan {
  let reply: ReplyMeta | undefined
  if (draft.mode !== 'new' && draft.inReplyToMessageId) {
    const route = getMessageRoute(draft.inReplyToMessageId)
    const msg = getMessageById(draft.inReplyToMessageId)
    if (route && msg) {
      reply = {
        providerMessageId: route.providerMessageId,
        providerThreadId: msg.providerThreadId,
        mode: draft.mode
      }
    }
  }
  return {
    from: fromAddressFor(draft.accountId),
    to: parseAddressList(draft.to),
    cc: parseAddressList(draft.cc),
    bcc: parseAddressList(draft.bcc),
    subject: draft.subject,
    html: draft.bodyHtml,
    attachments: draft.attachments.map((a) => ({
      path: a.path,
      filename: a.name,
      mimeType: a.mimeType
    })),
    reply
  }
}

async function planToPayload(plan: SendPlan): Promise<SendPayload> {
  const attachments: SendAttachment[] = []
  for (const a of plan.attachments) {
    attachments.push({
      filename: a.filename,
      mimeType: a.mimeType,
      data: await readFile(a.path)
    })
  }
  return {
    from: plan.from,
    to: plan.to,
    cc: plan.cc,
    bcc: plan.bcc,
    subject: plan.subject,
    html: plan.html,
    attachments,
    reply: plan.reply
  }
}

// ---------- persistence ----------

interface OutboxRow {
  id: string
  draft_id: string
  account_id: string
  subject: string
  payload_json: string
  status: OutboxStatus
  attempts: number
  error: string | null
  send_after: number
  updated_at: number
}

function rowToItem(r: OutboxRow): OutboxItem {
  return {
    id: r.id,
    draftId: r.draft_id,
    accountId: r.account_id,
    subject: r.subject,
    status: r.status,
    attempts: r.attempts,
    error: r.error,
    sendAfter: r.send_after,
    updatedAt: r.updated_at
  }
}

export function listOutbox(): OutboxItem[] {
  const db = getDb()
  const rows = db
    .prepare(`SELECT * FROM outbox ORDER BY updated_at DESC`)
    .all() as OutboxRow[]
  return rows.map(rowToItem)
}

function setStatus(
  id: string,
  status: OutboxStatus,
  extra: { error?: string | null; sendAfter?: number; attempts?: number } = {}
): void {
  const db = getDb()
  const current = db.prepare(`SELECT * FROM outbox WHERE id = ?`).get(id) as
    | OutboxRow
    | undefined
  if (!current) return
  db.prepare(
    `UPDATE outbox SET status=@status, error=@error, send_after=@sendAfter,
       attempts=@attempts, updated_at=@now WHERE id=@id`
  ).run({
    id,
    status,
    error: extra.error ?? current.error,
    sendAfter: extra.sendAfter ?? current.send_after,
    attempts: extra.attempts ?? current.attempts,
    now: Date.now()
  })
  broadcast()
}

function broadcast(): void {
  const items = listOutbox()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('compose:outbox', items)
  }
}

// ---------- public API ----------

// sendAt: epoch ms to send at (scheduled send). Omit for a normal send with
// the short undo window.
export function enqueue(draft: Draft, sendAt?: number): string {
  const db = getDb()
  const id = randomUUID()
  const plan = resolvePlan(draft)
  const sendAfter =
    sendAt && sendAt > Date.now() ? sendAt : Date.now() + undoWindowMs()
  db.prepare(
    `INSERT INTO outbox (id, draft_id, account_id, subject, payload_json,
        status, attempts, error, send_after, updated_at)
     VALUES (@id, @draftId, @accountId, @subject, @payload,
        'pending', 0, NULL, @sendAfter, @now)`
  ).run({
    id,
    draftId: draft.id,
    accountId: draft.accountId,
    subject: draft.subject,
    payload: JSON.stringify(plan),
    sendAfter,
    now: Date.now()
  })
  broadcast()
  return id
}

// Cancel during the undo window (only if it hasn't started sending).
export function cancelSend(outboxId: string): boolean {
  const db = getDb()
  const row = db.prepare(`SELECT * FROM outbox WHERE id = ?`).get(outboxId) as
    | OutboxRow
    | undefined
  if (!row) return false
  if (row.status !== 'pending') return false
  db.prepare(`DELETE FROM outbox WHERE id = ?`).run(outboxId)
  broadcast()
  return true
}

async function processOne(row: OutboxRow): Promise<void> {
  setStatus(row.id, 'sending')
  try {
    const plan = JSON.parse(row.payload_json) as SendPlan
    const provider: Provider = row.account_id.startsWith('google:')
      ? 'google'
      : 'microsoft'
    const payload = await planToPayload(plan)
    await adapterFor(provider).send(ctxFor(row.account_id), payload)

    setStatus(row.id, 'sent', { error: null })
    // Clean up the draft; keep the sent row briefly for the UI, then remove.
    deleteDraft(row.draft_id)
    setTimeout(() => {
      const db = getDb()
      db.prepare(`DELETE FROM outbox WHERE id = ? AND status = 'sent'`).run(
        row.id
      )
      broadcast()
    }, 4_000)
  } catch (err) {
    const attempts = row.attempts + 1
    if (attempts >= MAX_ATTEMPTS) {
      setStatus(row.id, 'failed', {
        error: (err as Error).message,
        attempts
      })
    } else {
      // Exponential backoff before the next attempt.
      const delay = 2_000 * 2 ** (attempts - 1)
      setStatus(row.id, 'pending', {
        error: (err as Error).message,
        attempts,
        sendAfter: Date.now() + delay
      })
    }
  }
}

let timer: NodeJS.Timeout | null = null
let processing = false

async function tick(): Promise<void> {
  if (processing) return
  processing = true
  try {
    const db = getDb()
    const now = Date.now()
    const due = db
      .prepare(
        `SELECT * FROM outbox WHERE status = 'pending' AND send_after <= ?
         ORDER BY send_after ASC`
      )
      .all(now) as OutboxRow[]
    for (const row of due) {
      // Re-read to ensure it wasn't cancelled meanwhile.
      const fresh = db
        .prepare(`SELECT * FROM outbox WHERE id = ?`)
        .get(row.id) as OutboxRow | undefined
      if (fresh && fresh.status === 'pending') await processOne(fresh)
    }
  } finally {
    processing = false
  }
}

export function startOutbox(): void {
  if (timer) return
  // Any row stuck in 'sending' (e.g. app was killed mid-send) -> retry.
  const db = getDb()
  db.prepare(
    `UPDATE outbox SET status = 'pending' WHERE status = 'sending'`
  ).run()
  timer = setInterval(() => void tick(), TICK_MS)
}

export function stopOutbox(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
