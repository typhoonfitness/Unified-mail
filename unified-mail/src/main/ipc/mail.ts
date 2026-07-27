// IPC handlers for the mail surface. All reads hit the local SQLite cache so
// the renderer is never blocked on the network. Mutations update the cache
// optimistically and propagate to the provider in the background.

import { ipcMain, app, shell } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import type { MessageFilters, Provider } from '@shared/types'
import { getValidAccessToken } from '../auth/session'
import {
  listMessages,
  listThreads,
  getThread,
  setReadLocal,
  setStarredLocal,
  setAttachments,
  removeMessageLocal,
  archiveThread,
  getMessageRoute,
  markThreadsReadLocal,
  searchContacts,
  snoozeThread,
  setFollowUp,
  clearFollowUp,
  listBulkSenders,
  inboxMessagesFromSender
} from '../sync/store'
import { noteSnoozeChanged } from '../sync/snoozeScheduler'
import { gmailAdapter } from '../sync/gmail'
import { outlookAdapter } from '../sync/outlook'
import { manualSync, getAllSyncStatus } from '../sync/engine'
import type { AdapterContext } from '../sync/types'
import type { ProviderAdapter as Adapter } from '../sync/types'

function ctxFor(accountId: string): AdapterContext {
  return { accountId, getAccessToken: () => getValidAccessToken(accountId) }
}

function adapterFor(provider: Provider): Adapter {
  return provider === 'google' ? gmailAdapter : outlookAdapter
}

// Ensure a unique destination path so downloads never overwrite each other.
function uniquePath(dir: string, filename: string): string {
  return join(dir, `${Date.now()}-${filename}`)
}

export function registerMailIpc(): void {
  ipcMain.handle('mail:listThreads', (_e, filters: MessageFilters = {}) =>
    listThreads(filters)
  )

  ipcMain.handle('mail:listMessages', (_e, filters: MessageFilters = {}) =>
    listMessages(filters)
  )

  ipcMain.handle('mail:getThread', (_e, id: string) => getThread(id))

  ipcMain.handle(
    'mail:markRead',
    async (_e, messageId: string, read: boolean) => {
      const route = getMessageRoute(messageId)
      if (!route) return { ok: false, error: 'Message not found' }
      // Optimistic local update first.
      setReadLocal(messageId, read)
      try {
        await adapterFor(route.provider).setRead(
          ctxFor(route.accountId),
          route.providerMessageId,
          read
        )
        return { ok: true }
      } catch (err) {
        // Roll back the optimistic change on failure.
        setReadLocal(messageId, !read)
        return { ok: false, error: (err as Error).message }
      }
    }
  )

  ipcMain.handle(
    'mail:star',
    async (_e, messageId: string, starred: boolean) => {
      const route = getMessageRoute(messageId)
      if (!route) return { ok: false, error: 'Message not found' }
      setStarredLocal(messageId, starred)
      try {
        await adapterFor(route.provider).setStarred(
          ctxFor(route.accountId),
          route.providerMessageId,
          starred
        )
        return { ok: true }
      } catch (err) {
        setStarredLocal(messageId, !starred)
        return { ok: false, error: (err as Error).message }
      }
    }
  )

  // Archive / trash both remove the message from the local inbox optimistically;
  // on remote failure the next sync restores the true state.
  ipcMain.handle('mail:archive', async (_e, messageId: string) => {
    const route = getMessageRoute(messageId)
    if (!route) return { ok: false, error: 'Message not found' }
    // Flag the thread as archived locally (moves it to the shared Archive
    // view) rather than deleting it, then archive on the provider.
    archiveThread(messageId, true)
    try {
      await adapterFor(route.provider).archive(
        ctxFor(route.accountId),
        route.providerMessageId
      )
      return { ok: true }
    } catch (err) {
      archiveThread(messageId, false)
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('mail:trash', async (_e, messageId: string) => {
    const route = getMessageRoute(messageId)
    if (!route) return { ok: false, error: 'Message not found' }
    removeMessageLocal(messageId)
    try {
      await adapterFor(route.provider).trash(
        ctxFor(route.accountId),
        route.providerMessageId
      )
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('mail:getAttachments', async (_e, messageId: string) => {
    const route = getMessageRoute(messageId)
    if (!route) return []
    const list = await adapterFor(route.provider).listAttachments(
      ctxFor(route.accountId),
      route.providerMessageId
    )
    setAttachments(messageId, list)
    return list
  })

  ipcMain.handle(
    'mail:downloadAttachment',
    async (_e, messageId: string, attachmentId: string) => {
      const route = getMessageRoute(messageId)
      if (!route) return { ok: false, error: 'Message not found' }
      try {
        const file = await adapterFor(route.provider).downloadAttachment(
          ctxFor(route.accountId),
          route.providerMessageId,
          attachmentId
        )
        const dest = uniquePath(app.getPath('downloads'), file.filename)
        await writeFile(dest, file.data)
        return { ok: true, path: dest }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    }
  )

  // Mark a set of threads read locally, then propagate to providers in the
  // background (bounded, best-effort).
  ipcMain.handle('mail:markThreadsRead', async (_e, threadIds: string[]) => {
    try {
      const routes = markThreadsReadLocal(threadIds)
      void (async () => {
        for (const r of routes.slice(0, 300)) {
          try {
            await adapterFor(r.provider).setRead(
              ctxFor(r.accountId),
              r.providerMessageId,
              true
            )
          } catch {
            /* ignore individual failures */
          }
        }
      })()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(
    'mail:snooze',
    async (_e, threadId: string, until: number) => {
      try {
        snoozeThread(threadId, until)
        noteSnoozeChanged()
        return { ok: true }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    }
  )

  // Remind me if no reply: set/clear a follow-up on a thread.
  ipcMain.handle('mail:remindNoReply', async (_e, threadId: string, at: number) => {
    try {
      setFollowUp(threadId, at)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('mail:clearFollowUp', async (_e, threadId: string) => {
    try {
      clearFollowUp(threadId)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('mail:listBulkSenders', () => listBulkSenders())

  // Open the sender's unsubscribe link (if any) and archive their inbox mail.
  ipcMain.handle('mail:unsubscribeSender', async (_e, fromEmail: string) => {
    let opened = false
    try {
      const sender = listBulkSenders().find(
        (s) => s.fromEmail.toLowerCase() === fromEmail.toLowerCase()
      )
      const target = sender?.unsubscribeUrl ?? sender?.unsubscribeMailto ?? null
      if (target) {
        await shell.openExternal(target)
        opened = true
      }
      // Archive everything currently in the inbox from this sender.
      const msgs = inboxMessagesFromSender(fromEmail)
      for (const m of msgs) {
        archiveThread(m.id, true)
        void adapterFor(m.provider)
          .archive(ctxFor(m.accountId), m.providerMessageId)
          .catch(() => {})
      }
      return { ok: true, opened, archived: msgs.length }
    } catch (err) {
      return { ok: false, opened, archived: 0, error: (err as Error).message }
    }
  })

  ipcMain.handle('mail:sync', async (_e, accountId?: string) => {
    try {
      await manualSync(accountId)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('mail:getSyncStatus', () => getAllSyncStatus())

  ipcMain.handle('mail:searchContacts', (_e, query: string) =>
    searchContacts(query)
  )
}
