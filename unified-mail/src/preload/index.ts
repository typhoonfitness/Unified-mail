// Preload script. Runs in an isolated context with access to Node's ipcRenderer
// and exposes ONLY a small, typed API to the renderer via contextBridge. The
// renderer cannot reach ipcRenderer, Node, or tokens directly.

import { contextBridge, ipcRenderer } from 'electron'
import type {
  ExposedApi,
  Provider,
  MessageFilters,
  SyncStatus,
  Draft,
  ComposeMode,
  OutboxItem,
  Snippet,
  AppSettings
} from '../shared/types'

const api: ExposedApi = {
  auth: {
    connect: (provider: Provider) => ipcRenderer.invoke('auth:connect', provider),
    disconnect: (accountId: string) =>
      ipcRenderer.invoke('auth:disconnect', accountId),
    listAccounts: () => ipcRenderer.invoke('auth:listAccounts')
  },
  mail: {
    listThreads: (filters?: MessageFilters) =>
      ipcRenderer.invoke('mail:listThreads', filters),
    listMessages: (filters?: MessageFilters) =>
      ipcRenderer.invoke('mail:listMessages', filters),
    getThread: (id: string) => ipcRenderer.invoke('mail:getThread', id),
    markRead: (messageId: string, read: boolean) =>
      ipcRenderer.invoke('mail:markRead', messageId, read),
    markThreadsRead: (threadIds: string[]) =>
      ipcRenderer.invoke('mail:markThreadsRead', threadIds),
    star: (messageId: string, starred: boolean) =>
      ipcRenderer.invoke('mail:star', messageId, starred),
    archive: (messageId: string) =>
      ipcRenderer.invoke('mail:archive', messageId),
    trash: (messageId: string) => ipcRenderer.invoke('mail:trash', messageId),
    getAttachments: (messageId: string) =>
      ipcRenderer.invoke('mail:getAttachments', messageId),
    downloadAttachment: (messageId: string, attachmentId: string) =>
      ipcRenderer.invoke('mail:downloadAttachment', messageId, attachmentId),
    snooze: (threadId: string, until: number) =>
      ipcRenderer.invoke('mail:snooze', threadId, until),
    remindNoReply: (threadId: string, at: number) =>
      ipcRenderer.invoke('mail:remindNoReply', threadId, at),
    clearFollowUp: (threadId: string) =>
      ipcRenderer.invoke('mail:clearFollowUp', threadId),
    listBulkSenders: () => ipcRenderer.invoke('mail:listBulkSenders'),
    unsubscribeSender: (fromEmail: string) =>
      ipcRenderer.invoke('mail:unsubscribeSender', fromEmail),
    sync: (accountId?: string) => ipcRenderer.invoke('mail:sync', accountId),
    getSyncStatus: () => ipcRenderer.invoke('mail:getSyncStatus'),
    searchContacts: (query: string) =>
      ipcRenderer.invoke('mail:searchContacts', query)
  },
  compose: {
    pickFiles: () => ipcRenderer.invoke('compose:pickFiles'),
    saveDraft: (draft: Draft) => ipcRenderer.invoke('compose:saveDraft', draft),
    listDrafts: () => ipcRenderer.invoke('compose:listDrafts'),
    getDraft: (id: string) => ipcRenderer.invoke('compose:getDraft', id),
    deleteDraft: (id: string) => ipcRenderer.invoke('compose:deleteDraft', id),
    buildReply: (messageId: string, mode: ComposeMode) =>
      ipcRenderer.invoke('compose:buildReply', messageId, mode),
    send: (draft: Draft, sendAt?: number) =>
      ipcRenderer.invoke('compose:send', draft, sendAt),
    cancelSend: (outboxId: string) =>
      ipcRenderer.invoke('compose:cancelSend', outboxId),
    getOutbox: () => ipcRenderer.invoke('compose:getOutbox')
  },
  ai: {
    summarize: (threadId: string) =>
      ipcRenderer.invoke('ai:summarize', threadId),
    draftReply: (threadId: string, instructions: string) =>
      ipcRenderer.invoke('ai:draftReply', threadId, instructions),
    digest: (range: string) => ipcRenderer.invoke('ai:digest', range)
  },
  snippets: {
    list: () => ipcRenderer.invoke('snippets:list'),
    save: (snippet: Snippet) => ipcRenderer.invoke('snippets:save', snippet),
    remove: (id: string) => ipcRenderer.invoke('snippets:remove', id)
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (partial: Partial<AppSettings>) =>
      ipcRenderer.invoke('settings:set', partial)
  },
  clipboard: {
    read: () => ipcRenderer.invoke('app:clipboardRead'),
    write: (text: string) => ipcRenderer.invoke('app:clipboardWrite', text)
  }
}

// Push channels: main -> renderer.
const events = {
  onSyncStatus: (cb: (statuses: SyncStatus[]) => void) => {
    const listener = (_e: unknown, statuses: SyncStatus[]): void => cb(statuses)
    ipcRenderer.on('mail:syncStatus', listener)
    return () => ipcRenderer.removeListener('mail:syncStatus', listener)
  },
  onOutbox: (cb: (items: OutboxItem[]) => void) => {
    const listener = (_e: unknown, items: OutboxItem[]): void => cb(items)
    ipcRenderer.on('compose:outbox', listener)
    return () => ipcRenderer.removeListener('compose:outbox', listener)
  },
  onMailChanged: (cb: () => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('mail:changed', listener)
    return () => ipcRenderer.removeListener('mail:changed', listener)
  },
  onSettingsChanged: (cb: (settings: AppSettings) => void) => {
    const listener = (_e: unknown, settings: AppSettings): void => cb(settings)
    ipcRenderer.on('settings:changed', listener)
    return () => ipcRenderer.removeListener('settings:changed', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)
contextBridge.exposeInMainWorld('events', events)
