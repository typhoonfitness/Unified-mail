// Native OS notifications for new mail, gated by settings (enabled + DnD).

import { Notification } from 'electron'
import type { Message } from '@shared/types'
import { getSettings } from '../settings/settingsStore'
import { appIconPath } from './appIcon'

export function notifyNewMail(messages: Message[]): void {
  if (messages.length === 0) return
  const settings = getSettings()
  if (!settings.notifications || settings.doNotDisturb) return
  if (!Notification.isSupported()) return

  const icon = appIconPath()
  if (messages.length === 1) {
    const m = messages[0]
    new Notification({
      title: m.from?.name || m.from?.email || 'New message',
      body: m.subject || m.snippet || '(no subject)',
      icon
    }).show()
  } else {
    new Notification({
      title: `${messages.length} new messages`,
      body: messages
        .slice(0, 3)
        .map((m) => m.subject || '(no subject)')
        .join(' · '),
      icon
    }).show()
  }
}
