// CRUD for locally-saved drafts (autosaved from the compose window).

import { getDb } from '../db'
import type { Draft, DraftAttachment, ComposeMode } from '@shared/types'

interface DraftRow {
  id: string
  account_id: string
  to_addr: string
  cc_addr: string
  bcc_addr: string
  subject: string
  body_html: string
  mode: string
  in_reply_to_message_id: string | null
  attachments_json: string
  updated_at: number
}

function rowToDraft(r: DraftRow): Draft {
  return {
    id: r.id,
    accountId: r.account_id,
    to: r.to_addr,
    cc: r.cc_addr,
    bcc: r.bcc_addr,
    subject: r.subject,
    bodyHtml: r.body_html,
    mode: r.mode as ComposeMode,
    inReplyToMessageId: r.in_reply_to_message_id,
    attachments: JSON.parse(r.attachments_json) as DraftAttachment[],
    updatedAt: r.updated_at
  }
}

export function saveDraft(draft: Draft): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO drafts (
        id, account_id, to_addr, cc_addr, bcc_addr, subject, body_html,
        mode, in_reply_to_message_id, attachments_json, updated_at
     ) VALUES (
        @id, @accountId, @to, @cc, @bcc, @subject, @bodyHtml,
        @mode, @inReplyTo, @attachments, @updatedAt
     )
     ON CONFLICT(id) DO UPDATE SET
        account_id = excluded.account_id,
        to_addr = excluded.to_addr,
        cc_addr = excluded.cc_addr,
        bcc_addr = excluded.bcc_addr,
        subject = excluded.subject,
        body_html = excluded.body_html,
        mode = excluded.mode,
        in_reply_to_message_id = excluded.in_reply_to_message_id,
        attachments_json = excluded.attachments_json,
        updated_at = excluded.updated_at`
  ).run({
    id: draft.id,
    accountId: draft.accountId,
    to: draft.to,
    cc: draft.cc,
    bcc: draft.bcc,
    subject: draft.subject,
    bodyHtml: draft.bodyHtml,
    mode: draft.mode,
    inReplyTo: draft.inReplyToMessageId,
    attachments: JSON.stringify(draft.attachments),
    updatedAt: Date.now()
  })
}

export function getDraft(id: string): Draft | null {
  const db = getDb()
  const row = db.prepare(`SELECT * FROM drafts WHERE id = ?`).get(id) as
    | DraftRow
    | undefined
  return row ? rowToDraft(row) : null
}

export function listDrafts(): Draft[] {
  const db = getDb()
  const rows = db
    .prepare(`SELECT * FROM drafts ORDER BY updated_at DESC`)
    .all() as DraftRow[]
  return rows.map(rowToDraft)
}

export function deleteDraft(id: string): void {
  const db = getDb()
  db.prepare(`DELETE FROM drafts WHERE id = ?`).run(id)
}
