// IPC for composing, drafts, attachments, and the send queue.

import { ipcMain, dialog, BrowserWindow } from 'electron'
import { statSync } from 'fs'
import { basename, extname } from 'path'
import { randomUUID } from 'crypto'
import type {
  Draft,
  DraftAttachment,
  ComposeMode,
  Address
} from '@shared/types'
import { listConnectedAccounts } from '../auth/session'
import { getMessageById } from '../sync/store'
import {
  saveDraft,
  getDraft,
  listDrafts,
  deleteDraft
} from '../compose/draftStore'
import {
  enqueue,
  cancelSend,
  listOutbox
} from '../compose/outbox'
import { addressLine } from '../compose/format'

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip'
}

function mimeForPath(p: string): string {
  return MIME_BY_EXT[extname(p).toLowerCase()] ?? 'application/octet-stream'
}

function stripReplyPrefix(subject: string): string {
  return subject.replace(/^(re|fwd|fw)\s*:\s*/i, '').trim()
}

function quoteOriginal(msg: {
  from: Address | null
  receivedAt: number
  bodyHtml: string | null
  bodyText: string | null
}): string {
  const who = msg.from ? `${msg.from.name ?? ''} <${msg.from.email}>` : 'sender'
  const when = new Date(msg.receivedAt).toLocaleString()
  const inner =
    msg.bodyHtml ??
    `<pre style="white-space:pre-wrap">${(msg.bodyText ?? '').replace(
      /</g,
      '&lt;'
    )}</pre>`
  return (
    `<br><br><div style="border-left:2px solid #ccc;padding-left:10px;color:#555">` +
    `<div>On ${when}, ${who} wrote:</div>${inner}</div>`
  )
}

export function registerComposeIpc(): void {
  ipcMain.handle('compose:pickFiles', async (): Promise<DraftAttachment[]> => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const result = win
      ? await dialog.showOpenDialog(win, {
          properties: ['openFile', 'multiSelections']
        })
      : await dialog.showOpenDialog({
          properties: ['openFile', 'multiSelections']
        })
    if (result.canceled) return []
    return result.filePaths.map((p) => ({
      name: basename(p),
      path: p,
      size: safeSize(p),
      mimeType: mimeForPath(p)
    }))
  })

  ipcMain.handle('compose:saveDraft', async (_e, draft: Draft) => {
    try {
      saveDraft(draft)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('compose:listDrafts', () => listDrafts())
  ipcMain.handle('compose:getDraft', (_e, id: string) => getDraft(id))
  ipcMain.handle('compose:deleteDraft', async (_e, id: string) => {
    try {
      deleteDraft(id)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(
    'compose:buildReply',
    async (_e, messageId: string, mode: ComposeMode): Promise<Draft> => {
      const msg = getMessageById(messageId)
      const now = Date.now()
      const base: Draft = {
        id: randomUUID(),
        accountId: msg?.accountId ?? listConnectedAccounts()[0]?.id ?? '',
        to: '',
        cc: '',
        bcc: '',
        subject: '',
        bodyHtml: '',
        mode,
        inReplyToMessageId: msg ? messageId : null,
        attachments: [],
        updatedAt: now
      }
      if (!msg) return base

      const selfEmail = (
        listConnectedAccounts().find((a) => a.id === msg.accountId)?.email ?? ''
      ).toLowerCase()

      if (mode === 'forward') {
        base.subject = `Fwd: ${stripReplyPrefix(msg.subject)}`
        base.bodyHtml = quoteOriginal(msg)
      } else {
        base.subject = `Re: ${stripReplyPrefix(msg.subject)}`
        base.to = msg.from ? addressLine([msg.from]) : ''
        if (mode === 'replyAll') {
          const others = [...msg.to, ...msg.cc].filter(
            (a) =>
              a.email.toLowerCase() !== selfEmail &&
              a.email.toLowerCase() !== msg.from?.email.toLowerCase()
          )
          base.cc = addressLine(others)
        }
        base.bodyHtml = quoteOriginal(msg)
      }
      return base
    }
  )

  ipcMain.handle('compose:send', async (_e, draft: Draft, sendAt?: number) => {
    try {
      // Persist first so a resolved plan is always recoverable.
      saveDraft(draft)
      const outboxId = enqueue(draft, sendAt)
      return { ok: true, outboxId }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('compose:cancelSend', async (_e, outboxId: string) => {
    const ok = cancelSend(outboxId)
    return { ok, error: ok ? undefined : 'Too late to cancel' }
  })

  ipcMain.handle('compose:getOutbox', () => listOutbox())
}

function safeSize(p: string): number {
  try {
    return statSync(p).size
  } catch {
    return 0
  }
}
