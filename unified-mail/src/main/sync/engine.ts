// Sync engine + scheduler.
//
// - full sync on first connect (no cursor yet)
// - incremental delta sync every 60s and on-demand (manual refresh)
// - per-account in-flight guard so overlapping timers don't double-run
// - broadcasts sync status changes to the renderer

import { BrowserWindow } from 'electron'
import type { Provider, SyncStatus } from '@shared/types'
import { listConnectedAccounts, getValidAccessToken } from '../auth/session'
import { gmailAdapter } from './gmail'
import { outlookAdapter } from './outlook'
import type { AdapterContext, ProviderAdapter, SyncResult } from './types'
import {
  upsertMessages,
  deleteMessagesByProviderIds,
  filterNewMessageIds
} from './store'
import { getSyncState, saveCursor } from './syncState'
import { applyRulesToNewMail } from './triage'
import { checkFollowUpsAfterSync } from './followup'
import { notifyNewMail } from '../ui/notifier'
import { updateTray } from '../ui/tray'
import { getSettings } from '../settings/settingsStore'

let syncIntervalMs = 60_000
const FULL_SYNC_LIMIT = 600

function adapterFor(provider: Provider): ProviderAdapter {
  return provider === 'google' ? gmailAdapter : outlookAdapter
}

const inFlight = new Set<string>()
const errors = new Map<string, string>()
let timer: NodeJS.Timeout | null = null

function contextFor(accountId: string): AdapterContext {
  return {
    accountId,
    getAccessToken: () => getValidAccessToken(accountId),
    fullSyncLimit: FULL_SYNC_LIMIT
  }
}

function broadcastStatus(): void {
  const statuses = getAllSyncStatus()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('mail:syncStatus', statuses)
  }
}

export function getAllSyncStatus(): SyncStatus[] {
  return listConnectedAccounts().map((a) => {
    const s = getSyncState(a.id)
    return {
      accountId: a.id,
      lastSyncAt: s?.lastSyncAt ?? null,
      lastFullSyncAt: s?.lastFullSyncAt ?? null,
      syncing: inFlight.has(a.id),
      error: errors.get(a.id) ?? null
    }
  })
}

function persist(result: SyncResult, accountId: string, full: boolean): void {
  // Detect genuinely-new messages before writing, so we can fire notifications
  // and run auto-triage (but never on the initial full sync, to avoid a flood).
  let newlyArrived: typeof result.messages = []
  let brandNew: typeof result.messages = []
  if (!full) {
    const ids = result.messages.map((m) => `${accountId}::${m.providerMessageId}`)
    const newIds = filterNewMessageIds(ids)
    brandNew = result.messages.filter((m) =>
      newIds.has(`${accountId}::${m.providerMessageId}`)
    )
    newlyArrived = brandNew.filter((m) => !m.isRead && m.folder === 'inbox')
  }

  upsertMessages(result.messages)
  deleteMessagesByProviderIds(accountId, result.deletedProviderMessageIds)
  saveCursor(accountId, result.cursor, { full })

  // Auto-triage rules run over brand-new mail only (after it's persisted so the
  // local archive/read flags stick). This can re-file or archive matches.
  if (brandNew.length > 0) applyRulesToNewMail(brandNew)
  // A newly-arrived inbound reply may satisfy a pending follow-up reminder.
  if (brandNew.length > 0) checkFollowUpsAfterSync()

  updateTray()
  if (newlyArrived.length > 0) {
    // Reuse the store shape -> Message via a light mapping for the notifier.
    notifyNewMail(
      newlyArrived.map((m) => ({
        ...m,
        id: `${accountId}::${m.providerMessageId}`
      }))
    )
  }
}

// Adjust the background sync cadence (from Settings).
export function setSyncInterval(seconds: number): void {
  syncIntervalMs = Math.max(15, seconds) * 1000
  if (timer) {
    clearInterval(timer)
    timer = setInterval(() => void syncAll(), syncIntervalMs)
  }
}

export async function syncAccount(accountId: string): Promise<void> {
  if (inFlight.has(accountId)) return
  const account = listConnectedAccounts().find((a) => a.id === accountId)
  if (!account) return

  inFlight.add(accountId)
  errors.delete(accountId)
  broadcastStatus()

  try {
    const adapter = adapterFor(account.provider)
    const ctx = contextFor(accountId)
    const state = getSyncState(accountId)

    const hasCursor = Boolean(state?.historyId || state?.deltaLink)
    if (!hasCursor) {
      const result = await adapter.fullSync(ctx)
      persist(result, accountId, true)
    } else {
      const result = await adapter.incrementalSync(ctx, {
        historyId: state?.historyId,
        deltaLink: state?.deltaLink
      })
      if ('needsFullSync' in result) {
        const full = await adapter.fullSync(ctx)
        persist(full, accountId, true)
      } else {
        persist(result, accountId, false)
      }
    }
  } catch (err) {
    errors.set(accountId, (err as Error).message)
  } finally {
    inFlight.delete(accountId)
    broadcastStatus()
  }
}

export async function syncAll(): Promise<void> {
  const accounts = listConnectedAccounts()
  await Promise.all(accounts.map((a) => syncAccount(a.id)))
}

// Called right after an account connects (from the auth IPC handler).
export function onAccountConnected(accountId: string): void {
  void syncAccount(accountId)
}

export function startScheduler(): void {
  if (timer) return
  // Honor the saved sync frequency.
  syncIntervalMs = Math.max(15, getSettings().syncSeconds) * 1000
  // Kick an immediate sync, then poll.
  void syncAll()
  timer = setInterval(() => void syncAll(), syncIntervalMs)
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

// Manual refresh entry point (IPC). Optionally a single account.
export async function manualSync(accountId?: string): Promise<void> {
  if (accountId) await syncAccount(accountId)
  else await syncAll()
}
