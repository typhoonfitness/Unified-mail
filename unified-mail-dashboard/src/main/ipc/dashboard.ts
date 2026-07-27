// IPC for the dashboard cards: live data proxies + local to-do/links.

import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { DashboardConfig } from '@shared/types'
import { getDashboardConfig, setDashboardConfig } from '../dashboard/config'
import * as proxy from '../dashboard/proxy'
import {
  listGifs,
  listAmbient,
  matchAmbientForGif,
  listMusic,
  trackMeta
} from '../media/library'
import {
  listTodos,
  addTodo,
  toggleTodo,
  removeTodo,
  listLinks,
  addLink,
  removeLink
} from '../dashboard/localStore'

// Wrap a proxy call so a network failure returns a safe empty value instead of
// rejecting the renderer promise (each card shows its own empty/err state).
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch {
    return fallback
  }
}

export function registerDashboardIpc(): void {
  ipcMain.handle('dash:getConfig', () => getDashboardConfig())
  ipcMain.handle('dash:setConfig', (_e, partial: Partial<DashboardConfig>) =>
    setDashboardConfig(partial)
  )

  ipcMain.handle('dash:geocode', (_e, q: string) =>
    safe(() => proxy.geocode(q), [])
  )
  ipcMain.handle('dash:weather', () =>
    safe(() => proxy.weather(getDashboardConfig()), null)
  )
  ipcMain.handle('dash:quotes', () =>
    safe(() => proxy.quotes(getDashboardConfig()), [])
  )
  ipcMain.handle('dash:quotesFor', (_e, symbols: string[]) =>
    safe(() => proxy.quotesForSymbols(symbols), [])
  )
  ipcMain.handle('dash:calendar', () =>
    safe(() => proxy.calendar(getDashboardConfig()), [])
  )
  ipcMain.handle('dash:news', () =>
    safe(() => proxy.news(getDashboardConfig()), [])
  )
  ipcMain.handle('dash:social', () =>
    safe(() => proxy.social(getDashboardConfig()), [])
  )

  ipcMain.handle('dash:listTodos', () => listTodos())
  ipcMain.handle('dash:addTodo', (_e, text: string) => addTodo(text))
  ipcMain.handle('dash:toggleTodo', (_e, id: string) => toggleTodo(id))
  ipcMain.handle('dash:removeTodo', (_e, id: string) => removeTodo(id))

  ipcMain.handle('dash:listLinks', () => listLinks())
  ipcMain.handle('dash:addLink', (_e, title: string, url: string) =>
    addLink(title, url)
  )
  ipcMain.handle('dash:removeLink', (_e, id: string) => removeLink(id))

  // screensaver / ambient
  ipcMain.handle('dash:listGifs', () => listGifs())
  ipcMain.handle('dash:listAmbient', () => listAmbient())
  ipcMain.handle('dash:matchAmbient', (_e, gifName: string) =>
    matchAmbientForGif(gifName, listAmbient())
  )
  ipcMain.handle(
    'dash:pickFolder',
    async (_e, kind: 'gifs' | 'ambient' | 'music'): Promise<string | null> => {
      const win = BrowserWindow.getFocusedWindow() ?? undefined
      const res = win
        ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] })
      if (res.canceled || !res.filePaths[0]) return null
      const path = res.filePaths[0]
      setDashboardConfig(
        kind === 'gifs'
          ? { gifsFolder: path }
          : kind === 'ambient'
            ? { ambientFolder: path }
            : { musicFolder: path }
      )
      return path
    }
  )

  ipcMain.handle('dash:listMusic', () => listMusic())
  ipcMain.handle('dash:trackMeta', (_e, name: string) => trackMeta(name))
}
