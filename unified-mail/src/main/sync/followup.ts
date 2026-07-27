// Follow-up reminders ("remind me if no reply"). State lives in SQLite
// (threads.follow_up_*), so it survives restarts. This scheduler periodically
// processes due reminders: replies cancel them, otherwise the thread surfaces
// in the Follow-ups view and we notify + refresh the renderer.

import { BrowserWindow, Notification } from 'electron'
import { processDueFollowUps, nextFollowUpTime } from './store'
import { appIconPath } from '../ui/appIcon'
import { getSettings } from '../settings/settingsStore'

const TICK_MS = 30_000
let timer: NodeJS.Timeout | null = null

function broadcastChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('mail:changed')
  }
}

function surface(subjects: string[]): void {
  if (subjects.length === 0) return
  broadcastChanged()
  const s = getSettings()
  if (!s.notifications || s.doNotDisturb) return
  const body =
    subjects.length === 1
      ? subjects[0]
      : `${subjects.length} threads need a follow-up`
  try {
    new Notification({
      title: 'Follow-up: no reply yet',
      body,
      icon: appIconPath()
    }).show()
  } catch {
    /* notifications unavailable */
  }
}

// Run a check now (called by the scheduler tick and after each sync).
export function checkFollowUpsAfterSync(): void {
  surface(processDueFollowUps())
}

export function startFollowUpScheduler(): void {
  if (timer) return
  timer = setInterval(() => surface(processDueFollowUps()), TICK_MS)
  // Surface anything already due at startup.
  surface(processDueFollowUps())
  void nextFollowUpTime()
}

export function stopFollowUpScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
