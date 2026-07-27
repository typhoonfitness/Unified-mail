// IPC for reusable snippets/templates.

import { ipcMain } from 'electron'
import type { Snippet } from '@shared/types'
import {
  listSnippets,
  saveSnippet,
  deleteSnippet
} from '../compose/snippetStore'

export function registerSnippetsIpc(): void {
  ipcMain.handle('snippets:list', () => listSnippets())

  ipcMain.handle('snippets:save', async (_e, snippet: Snippet) => {
    try {
      saveSnippet(snippet)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('snippets:remove', async (_e, id: string) => {
    try {
      deleteSnippet(id)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}
