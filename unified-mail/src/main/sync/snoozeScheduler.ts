// Re-surfaces snoozed threads. Snooze state lives in SQLite (threads.snoozed_until),
// so it survives restarts. This scheduler simply notifies the renderer to
// refresh whenever a snooze expires, both on a periodic tick and on startup.

import { BrowserWindow } from 'electron'
import { nextSnoozeExpiry } from './store'

const TICK_MS = 30_000

let timer: NodeJS.Timeout | null = null
let lastNext: number | null = null

function broadcastChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('mail:changed')
  }
}

function tick(): void {
  const next = nextSnoozeExpiry()
  // If a previously-pending snooze has now passed (no longer the min, or gone),
  // tell the UI to refresh so the thread reappears in the inbox.
  if (lastNext !== null && (next === null || next > lastNext)) {
    broadcastChanged()
  }
  lastNext = next
}

export function startSnoozeScheduler(): void {
  if (timer) return
  lastNext = nextSnoozeExpiry()
  timer = setInterval(tick, TICK_MS)
  // Surface anything already due at startup.
  broadcastChanged()
}

export function stopSnoozeScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

// Called right after a snooze action so the scheduler tracks the new nearest
// expiry without waiting a full tick.
export function noteSnoozeChanged(): void {
  lastNext = nextSnoozeExpiry()
}
