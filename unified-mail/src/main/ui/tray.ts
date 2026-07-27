// System tray: unread badge + quick-glance recent unread messages.

import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron'
import { countUnreadInbox, recentUnread } from '../sync/store'

let tray: Tray | null = null

// A tiny monochrome envelope icon embedded as a PNG data URL, so no binary
// asset needs to ship for the tray to work.
const ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA' +
  'AXNSR0IArs4c6QAAAHhJREFUOI3t0jEOgCAMheHfxMHVeAAvwP0P4gW8gYuLg4kDCU1pQxMn' +
  'B0jTgfL60UJBRJ7yBGitVQCwHwFrLXPOUUopqbXWjDGYc0YpBWMMxhillFprzTknYwzmnFFK' +
  'wRiDMUYppdZac87JGIM5Z5RSMMZgjFFKqbXWnHMyxnwBB6EY9d3l8kUAAAAASUVORK5CYII='

function icon(): Electron.NativeImage {
  const img = nativeImage.createFromDataURL(ICON_DATA_URL)
  // macOS renders template images correctly in light/dark menu bars.
  if (process.platform === 'darwin') img.setTemplateImage(true)
  return img
}

function showMainWindow(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
}

export function updateTray(): void {
  if (!tray) return
  const unread = countUnreadInbox()
  tray.setToolTip(unread > 0 ? `Unified Mail — ${unread} unread` : 'Unified Mail')

  const recent = recentUnread(5)
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: unread > 0 ? `${unread} unread` : 'No unread mail',
      enabled: false
    },
    { type: 'separator' }
  ]
  for (const m of recent) {
    template.push({
      label: `${(m.from?.name || m.from?.email || 'Unknown').slice(0, 24)} — ${(
        m.subject || '(no subject)'
      ).slice(0, 40)}`,
      click: showMainWindow
    })
  }
  if (recent.length > 0) template.push({ type: 'separator' })
  template.push(
    { label: 'Open Unified Mail', click: showMainWindow },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  )

  tray.setContextMenu(Menu.buildFromTemplate(template))

  // On macOS the dock badge is a nice extra signal.
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setBadge(unread > 0 ? String(unread) : '')
  }
}

export function createTray(): void {
  if (tray) return
  tray = new Tray(icon())
  tray.on('click', showMainWindow)
  updateTray()
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
