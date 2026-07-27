import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ComposeMode,
  ConnectedAccount,
  Draft,
  OutboxItem,
  SavedSearch,
  SyncStatus,
  ThreadDetail,
  ThreadSummary
} from '../../../shared/types'
import Sidebar, { selectionToFilters, type Selection } from './Sidebar'
import ThreadList from './ThreadList'
import ReadingPane from './ReadingPane'
import Compose from './Compose'
import Palette, { type PaletteItem } from './Palette'
import CheatSheet from './CheatSheet'
import SnippetManager from './SnippetManager'
import Settings from './Settings'
import UnsubscribeManager from './UnsubscribeManager'
import AttachmentBrowser from './AttachmentBrowser'
import DigestModal from './DigestModal'
import { snoozeOptions } from '../lib/snooze'

// Human-readable labels for every smart preset.
const PRESET_LABELS: Record<NonNullable<Selection['preset']>, string> = {
  promotions: 'Promotions / Ads',
  dated: 'Has dates',
  people: 'People',
  important: 'Important',
  social: 'Social updates',
  accounts: 'Account alerts',
  news: 'News'
}

function newDraft(accountId: string): Draft {
  return {
    id: crypto.randomUUID(),
    accountId,
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    bodyHtml: '<p></p>',
    mode: 'new',
    inReplyToMessageId: null,
    attachments: [],
    updatedAt: Date.now()
  }
}

interface Props {
  accounts: ConnectedAccount[]
  initialThreadId?: string
  onManageAccounts: () => void
  onReloadAccounts: () => void
}

export default function Inbox({
  accounts,
  initialThreadId,
  onManageAccounts,
  onReloadAccounts
}: Props): JSX.Element {
  const [selection, setSelection] = useState<Selection>({ folder: 'inbox' })
  const [search, setSearch] = useState('')
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [thread, setThread] = useState<ThreadDetail | null>(null)
  const [statuses, setStatuses] = useState<SyncStatus[]>([])
  const [compose, setCompose] = useState<Draft | null>(null)
  const [outbox, setOutbox] = useState<OutboxItem[]>([])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [cheatOpen, setCheatOpen] = useState(false)
  const [snippetMgrOpen, setSnippetMgrOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [snoozeTarget, setSnoozeTarget] = useState<string | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [autoImages, setAutoImages] = useState(false)
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [vipSenders, setVipSenders] = useState<string[]>([])
  const [remindTarget, setRemindTarget] = useState<string | null>(null)
  const [unsubOpen, setUnsubOpen] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [digestOpen, setDigestOpen] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const selectedIdRef = useRef<string | null>(null)
  selectedIdRef.current = selectedId
  const threadsRef = useRef<ThreadSummary[]>([])
  threadsRef.current = threads

  const filters = useMemo(() => {
    const base = selectionToFilters(selection)
    const vip = selection.preset === 'important' ? vipSenders : undefined
    return { ...base, vip, search: search.trim() || undefined }
  }, [selection, search, vipSenders])

  const refreshThreads = useCallback(async () => {
    const list = await window.api.mail.listThreads(filters)
    setThreads(list)
    return list
  }, [filters])

  // Reload the list when filters/search change.
  useEffect(() => {
    void refreshThreads()
  }, [refreshThreads])

  // Live sync status + auto-refresh the list whenever a sync completes.
  useEffect(() => {
    void window.api.mail.getSyncStatus().then(setStatuses)
    const unsub = window.events.onSyncStatus((s) => {
      setStatuses(s)
      void refreshThreads()
    })
    return unsub
  }, [refreshThreads])

  const openThread = useCallback(async (t: ThreadSummary) => {
    setSelectedId(t.id)
    const detail = await window.api.mail.getThread(t.id)
    setThread(detail)
    // Mark the newest message read on open if unread.
    if (detail && t.unreadCount > 0) {
      const latest = detail.messages[detail.messages.length - 1]
      if (latest && !latest.isRead) {
        await window.api.mail.markRead(latest.id, true)
        void refreshThreads()
      }
    }
  }, [refreshThreads])

  const reopen = useCallback(async () => {
    if (selectedId) {
      const detail = await window.api.mail.getThread(selectedId)
      setThread(detail)
    }
  }, [selectedId])

  const toggleStarThread = useCallback(
    async (t: ThreadSummary) => {
      await window.api.mail.star(t.lastMessageId, !t.hasStarred)
      void refreshThreads()
      void reopen()
    },
    [refreshThreads, reopen]
  )

  // Compose triggers.
  const startCompose = useCallback(async () => {
    const accountId = accounts[0]?.id ?? ''
    const settings = await window.api.settings.get()
    const sig = settings.signatures[accountId]
    const draft = newDraft(accountId)
    if (sig && sig.trim()) {
      draft.bodyHtml = `<p></p><p></p><div class="signature">${sig}</div>`
    }
    setCompose(draft)
  }, [accounts])

  const startReply = useCallback(
    async (messageId: string, mode: ComposeMode) => {
      const draft = await window.api.compose.buildReply(messageId, mode)
      setCompose(draft)
    },
    []
  )

  // Outbox subscription for the undo/pending toast.
  useEffect(() => {
    void window.api.compose.getOutbox().then(setOutbox)
    return window.events.onOutbox(setOutbox)
  }, [])

  // Re-surface snoozed threads (and any other main-side change) by refreshing.
  useEffect(() => {
    return window.events.onMailChanged(() => void refreshThreads())
  }, [refreshThreads])

  // Deep-link: open a specific thread when arriving from the dashboard.
  useEffect(() => {
    if (!initialThreadId) return
    void window.api.mail.getThread(initialThreadId).then((detail) => {
      if (detail) {
        setSelectedId(initialThreadId)
        setThread(detail)
      }
    })
  }, [initialThreadId])

  // Auto-load-images + saved searches from settings.
  useEffect(() => {
    const apply = (s: {
      autoLoadImages: boolean
      savedSearches: SavedSearch[]
      vipSenders: string[]
    }): void => {
      setAutoImages(s.autoLoadImages)
      setSavedSearches(s.savedSearches)
      setVipSenders(s.vipSenders)
    }
    void window.api.settings.get().then(apply)
    return window.events.onSettingsChanged(apply)
  }, [])

  // Track online/offline for the connectivity banner.
  useEffect(() => {
    const on = (): void => setOnline(true)
    const off = (): void => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const goTo = useCallback((sel: Selection) => {
    setSelection(sel)
    setSelectedId(null)
    setThread(null)
    setChecked(new Set())
  }, [])

  const doAction = useCallback(
    async (fn: () => Promise<unknown>) => {
      await fn()
      // Optimistic: clear open thread if it was removed, then refresh.
      void refreshThreads()
      void reopen()
    },
    [refreshThreads, reopen]
  )

  // Superhuman-style triage: remove the open thread, then auto-advance to the
  // next one in the list (same index after removal).
  const triageOpen = useCallback(
    async (fn: () => Promise<unknown>) => {
      const before = threadsRef.current
      const idx = before.findIndex((t) => t.id === selectedIdRef.current)
      await fn()
      const after = await refreshThreads()
      const next = idx >= 0 ? after[idx] : undefined
      if (next) void openThread(next)
      else {
        setSelectedId(null)
        setThread(null)
      }
    },
    [refreshThreads, openThread]
  )

  const toggleCheck = useCallback((id: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Apply a mail action to every checked thread (via its newest message).
  const bulk = useCallback(
    async (action: (messageId: string) => Promise<unknown>) => {
      const list = threadsRef.current
      for (const id of checked) {
        const t = list.find((x) => x.id === id)
        if (t) await action(t.lastMessageId)
      }
      setChecked(new Set())
      void refreshThreads()
      void reopen()
    },
    [checked, refreshThreads, reopen]
  )

  const selectedThread = useCallback(
    (): ThreadSummary | undefined =>
      threadsRef.current.find((t) => t.id === selectedIdRef.current),
    []
  )

  const archiveSelected = useCallback(() => {
    const t = selectedThread()
    if (t) void triageOpen(() => window.api.mail.archive(t.lastMessageId))
  }, [triageOpen, selectedThread])

  const deleteSelected = useCallback(() => {
    const t = selectedThread()
    if (t) void triageOpen(() => window.api.mail.trash(t.lastMessageId))
  }, [triageOpen, selectedThread])

  const moveSelection = useCallback(
    (delta: number) => {
      const list = threadsRef.current
      if (list.length === 0) return
      const idx = list.findIndex((t) => t.id === selectedIdRef.current)
      const next = idx < 0 ? 0 : Math.min(Math.max(idx + delta, 0), list.length - 1)
      void openThread(list[next])
    },
    [openThread]
  )

  const anyOverlay =
    Boolean(compose) ||
    paletteOpen ||
    cheatOpen ||
    snippetMgrOpen ||
    settingsOpen ||
    unsubOpen ||
    attachOpen ||
    digestOpen ||
    Boolean(snoozeTarget) ||
    Boolean(remindTarget)

  // Keyboard navigation + shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement
      const typing =
        el &&
        (el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable)

      // Command palette works everywhere.
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setPaletteOpen((v) => !v)
        return
      }
      if (e.key === 'Escape' && anyOverlay) {
        setPaletteOpen(false)
        setCheatOpen(false)
        setSnippetMgrOpen(false)
        setSettingsOpen(false)
        setSnoozeTarget(null)
        setRemindTarget(null)
        setUnsubOpen(false)
        setAttachOpen(false)
        setDigestOpen(false)
        return
      }
      if (typing || anyOverlay) return

      switch (e.key) {
        case 'c':
        case 'C':
          e.preventDefault()
          startCompose()
          break
        case 'r':
        case 'R':
          if (thread) {
            e.preventDefault()
            const latest = thread.messages[thread.messages.length - 1]
            void startReply(latest.id, 'reply')
          }
          break
        case 'j':
        case 'J':
          e.preventDefault()
          moveSelection(1)
          break
        case 'k':
        case 'K':
          e.preventDefault()
          moveSelection(-1)
          break
        case 'e':
        case 'E':
          e.preventDefault()
          archiveSelected()
          break
        case '#':
          e.preventDefault()
          deleteSelected()
          break
        case '/':
          e.preventDefault()
          searchRef.current?.focus()
          break
        case '?':
          e.preventDefault()
          setCheatOpen(true)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    anyOverlay,
    thread,
    startCompose,
    startReply,
    moveSelection,
    archiveSelected,
    deleteSelected
  ])

  // Command palette entries.
  const commands: PaletteItem[] = useMemo(() => {
    const list: PaletteItem[] = [
      { id: 'compose', label: 'Compose', hint: 'C', run: startCompose },
      {
        id: 'search',
        label: 'Search mail',
        hint: '/',
        run: () => searchRef.current?.focus()
      },
      {
        id: 'inbox',
        label: 'Go to All Inboxes',
        run: () => goTo({ folder: 'inbox' })
      },
      {
        id: 'unread',
        label: 'Go to Unread',
        run: () => goTo({ folder: 'inbox', unreadOnly: true })
      },
      {
        id: 'starred',
        label: 'Go to Starred',
        run: () => goTo({ folder: 'inbox', starredOnly: true })
      },
      {
        id: 'snoozed',
        label: 'Go to Snoozed',
        run: () => goTo({ folder: 'inbox', snoozedOnly: true })
      },
      {
        id: 'people',
        label: 'Find People (from humans)',
        run: () => goTo({ folder: 'inbox', preset: 'people' })
      },
      {
        id: 'promotions',
        label: 'Find Promotions / Ads',
        run: () => goTo({ folder: 'inbox', preset: 'promotions' })
      },
      {
        id: 'social',
        label: 'Find Social updates',
        run: () => goTo({ folder: 'inbox', preset: 'social' })
      },
      {
        id: 'accounts',
        label: 'Find Account alerts',
        run: () => goTo({ folder: 'inbox', preset: 'accounts' })
      },
      {
        id: 'news',
        label: 'Find News',
        run: () => goTo({ folder: 'inbox', preset: 'news' })
      },
      {
        id: 'dated',
        label: 'Find emails with dates',
        run: () => goTo({ folder: 'inbox', preset: 'dated' })
      },
      {
        id: 'followups',
        label: 'Go to Follow-ups',
        run: () => goTo({ folder: 'inbox', followUpOnly: true })
      },
      {
        id: 'unsub',
        label: 'Unsubscribe manager',
        run: () => setUnsubOpen(true)
      },
      {
        id: 'attachments',
        label: 'Browse attachments',
        run: () => setAttachOpen(true)
      },
      {
        id: 'digest',
        label: 'AI digest (today / week / month)',
        run: () => setDigestOpen(true)
      },
      {
        id: 'refresh',
        label: 'Sync now',
        run: () => void window.api.mail.sync()
      },
      {
        id: 'snippets',
        label: 'Manage snippets',
        run: () => setSnippetMgrOpen(true)
      },
      {
        id: 'settings',
        label: 'Open settings',
        run: () => setSettingsOpen(true)
      },
      {
        id: 'cheat',
        label: 'Keyboard shortcuts',
        hint: '?',
        run: () => setCheatOpen(true)
      }
    ]
    for (const acc of accounts) {
      list.push({
        id: `acct-${acc.id}`,
        label: `Go to ${acc.email}`,
        hint: acc.provider === 'google' ? 'Gmail' : 'Outlook',
        run: () => goTo({ accountId: acc.id, folder: 'inbox' })
      })
    }
    if (selectedIdRef.current) {
      const id = selectedIdRef.current
      list.unshift(
        { id: 'archive', label: 'Archive thread', hint: 'E', run: archiveSelected },
        { id: 'delete', label: 'Delete thread', hint: '#', run: deleteSelected },
        {
          id: 'snooze',
          label: 'Snooze…',
          run: () => setSnoozeTarget(id)
        },
        {
          id: 'remind',
          label: 'Remind me if no reply…',
          run: () => setRemindTarget(id)
        }
      )
    }
    return list
  }, [accounts, goTo, startCompose, archiveSelected, deleteSelected])

  const snoozeItems: PaletteItem[] = useMemo(() => {
    const opts = snoozeOptions()
    const items: PaletteItem[] = opts.map((o) => ({
      id: o.label,
      label: o.label,
      hint: new Date(o.at).toLocaleString([], {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit'
      }),
      run: () => {
        if (snoozeTarget) {
          void window.api.mail
            .snooze(snoozeTarget, o.at)
            .then(() => refreshThreads())
          setSelectedId(null)
          setThread(null)
        }
      }
    }))
    items.push({
      id: 'unsnooze',
      label: 'Unsnooze',
      run: () => {
        if (snoozeTarget)
          void window.api.mail.snooze(snoozeTarget, 0).then(() => refreshThreads())
      }
    })
    return items
  }, [snoozeTarget, refreshThreads])

  const remindItems: PaletteItem[] = useMemo(() => {
    const opts = snoozeOptions()
    const items: PaletteItem[] = opts.map((o) => ({
      id: o.label,
      label: o.label,
      hint: new Date(o.at).toLocaleString([], {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit'
      }),
      run: () => {
        if (remindTarget)
          void window.api.mail
            .remindNoReply(remindTarget, o.at)
            .then(() => refreshThreads())
      }
    }))
    items.push({
      id: 'clear-followup',
      label: 'Clear follow-up',
      run: () => {
        if (remindTarget)
          void window.api.mail
            .clearFollowUp(remindTarget)
            .then(() => refreshThreads())
      }
    })
    return items
  }, [remindTarget, refreshThreads])

  const toggleVip = useCallback(
    async (email: string) => {
      const e = email.toLowerCase()
      const has = vipSenders.some((v) => v.toLowerCase() === e)
      const next = has
        ? vipSenders.filter((v) => v.toLowerCase() !== e)
        : [...vipSenders, email]
      setVipSenders(next)
      await window.api.settings.set({ vipSenders: next })
    },
    [vipSenders]
  )

  const searchSender = useCallback((email: string) => {
    setSearch(`from:${email}`)
    setSelection({ folder: 'inbox' })
    setSelectedId(null)
    setThread(null)
    setChecked(new Set())
    searchRef.current?.focus()
  }, [])

  const applySaved = useCallback((s: SavedSearch) => {
    setSearch(s.search)
    setSelection({ folder: 'inbox', preset: s.preset })
    setSelectedId(null)
    setThread(null)
    setChecked(new Set())
  }, [])

  const saveCurrent = useCallback(async () => {
    if (!search.trim() && !selection.preset) return
    const name =
      search.trim() ||
      (selection.preset ? PRESET_LABELS[selection.preset] : 'Search')
    const next = [
      ...savedSearches,
      { id: crypto.randomUUID(), name, search: search.trim(), preset: selection.preset }
    ]
    setSavedSearches(next)
    await window.api.settings.set({ savedSearches: next })
  }, [search, selection.preset, savedSearches])

  const removeSaved = useCallback(
    async (id: string) => {
      const next = savedSearches.filter((s) => s.id !== id)
      setSavedSearches(next)
      await window.api.settings.set({ savedSearches: next })
    },
    [savedSearches]
  )

  const onSearchChange = (value: string): void => {
    setSearch(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => void refreshThreads(), 180)
  }

  const viewLabel = selection.folder === 'archive'
    ? 'Archive'
    : selection.preset
    ? PRESET_LABELS[selection.preset]
    : selection.followUpOnly
    ? 'Follow-ups'
    : selection.snoozedOnly
      ? 'Snoozed'
      : selection.starredOnly
        ? 'Starred'
        : selection.unreadOnly
          ? 'Unread'
          : selection.accountId
            ? (accounts.find((a) => a.id === selection.accountId)?.email ??
              'Account')
            : 'All Inboxes'
  const unreadThreads = threads.filter((t) => t.unreadCount > 0).length

  const anySyncing = statuses.some((s) => s.syncing)
  const lastSync = Math.max(0, ...statuses.map((s) => s.lastSyncAt ?? 0))
  const syncErr = statuses.find((s) => s.error)?.error

  return (
    <div className="shell">
      <div className="topbar">
        <span className="brand">UNIFIED MAIL</span>
        <span className="stat">
          {anySyncing
            ? 'SYNCING…'
            : lastSync
              ? `SYNCED ${new Date(lastSync).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })}`
              : 'IDLE'}
        </span>
        {syncErr && <span className="stat down">! {syncErr.slice(0, 60)}</span>}
        <span className="spacer" />
        <button className="link-btn" onClick={startCompose}>
          + compose
        </button>
        <button className="link-btn" onClick={() => void window.api.mail.sync()}>
          refresh
        </button>
        <button className="link-btn" onClick={() => setSettingsOpen(true)}>
          settings
        </button>
      </div>

      {!online && (
        <div className="offline-banner">
          ⚠ Offline — showing cached mail. Changes will sync when you reconnect.
        </div>
      )}

      <div className="panes">
        <Sidebar
          accounts={accounts}
          selection={selection}
          onSelect={goTo}
          onManageAccounts={onManageAccounts}
          savedSearches={savedSearches}
          onApplySaved={applySaved}
          onRemoveSaved={removeSaved}
          onOpenUnsubscribe={() => setUnsubOpen(true)}
          onOpenAttachments={() => setAttachOpen(true)}
          onOpenDigest={() => setDigestOpen(true)}
        />

        <div className="pane">
          <div className="pane-head">
            <span>
              {viewLabel}
              {unreadThreads > 0 && (
                <span className="faint"> · {unreadThreads}</span>
              )}
            </span>
            <span className="head-actions">
              {unreadThreads > 0 && (
                <button
                  className="hd-act"
                  title="mark all as read"
                  onClick={async () => {
                    const ids = threadsRef.current
                      .filter((t) => t.unreadCount > 0)
                      .map((t) => t.id)
                    await window.api.mail.markThreadsRead(ids)
                    void refreshThreads()
                  }}
                >
                  read all
                </button>
              )}
              {threads.length > 0 && (
                <button
                  className="hd-act"
                  title="select all / none"
                  onClick={() =>
                    setChecked((prev) =>
                      prev.size === threads.length
                        ? new Set()
                        : new Set(threads.map((t) => t.id))
                    )
                  }
                >
                  {checked.size === threads.length ? '☑ all' : '☐ all'}
                </button>
              )}
              <button
                className="hd-act"
                onClick={() => void window.api.mail.sync()}
              >
                sync
              </button>
              <span
                className={`status-dot ${
                  anySyncing ? 'busy' : syncErr ? 'err' : 'ok'
                }`}
              />
            </span>
          </div>
          <div className="search">
            <span className="prompt">&gt;</span>
            <input
              ref={searchRef}
              value={search}
              placeholder="search… (try from:name)"
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {(search.trim() || selection.preset) && (
              <button
                className="search-save"
                title="save this search"
                onClick={() => void saveCurrent()}
              >
                ★ save
              </button>
            )}
          </div>
          {checked.size > 0 && (
            <div className="bulk-bar">
              <span className="bulk-count">{checked.size} selected</span>
              <button
                className="hd-act"
                onClick={() => bulk((id) => window.api.mail.markRead(id, true))}
              >
                read
              </button>
              <button
                className="hd-act"
                onClick={() => bulk((id) => window.api.mail.markRead(id, false))}
              >
                unread
              </button>
              <button
                className="hd-act"
                onClick={() => bulk((id) => window.api.mail.star(id, true))}
              >
                star
              </button>
              <button
                className="hd-act"
                onClick={() => bulk((id) => window.api.mail.archive(id))}
              >
                archive
              </button>
              <button
                className="hd-act"
                onClick={() => bulk((id) => window.api.mail.trash(id))}
              >
                delete
              </button>
              <button
                className="hd-act"
                onClick={() => setChecked(new Set())}
              >
                clear
              </button>
            </div>
          )}
          <ThreadList
            threads={threads}
            selectedId={selectedId}
            checked={checked}
            onSelect={openThread}
            onToggleStar={toggleStarThread}
            onToggleCheck={toggleCheck}
          />
        </div>

        <ReadingPane
          thread={thread}
          onArchive={(id) => triageOpen(() => window.api.mail.archive(id))}
          onTrash={(id) => triageOpen(() => window.api.mail.trash(id))}
          onToggleRead={(id, read) =>
            doAction(() => window.api.mail.markRead(id, read))
          }
          onToggleStar={(id, starred) =>
            doAction(() => window.api.mail.star(id, starred))
          }
          onReply={(id, mode) => void startReply(id, mode)}
          onSnooze={() => selectedId && setSnoozeTarget(selectedId)}
          onRemind={() => selectedId && setRemindTarget(selectedId)}
          onSearchSender={searchSender}
          autoLoadImages={autoImages}
          vipSenders={vipSenders}
          onToggleVip={toggleVip}
        />
      </div>

      {paletteOpen && (
        <Palette items={commands} onClose={() => setPaletteOpen(false)} />
      )}
      {snoozeTarget && (
        <Palette
          title="snooze until"
          placeholder="snooze until…"
          items={snoozeItems}
          onClose={() => setSnoozeTarget(null)}
        />
      )}
      {remindTarget && (
        <Palette
          title="remind if no reply"
          placeholder="remind me…"
          items={remindItems}
          onClose={() => setRemindTarget(null)}
        />
      )}
      {unsubOpen && (
        <UnsubscribeManager
          onClose={() => setUnsubOpen(false)}
          onChanged={() => void refreshThreads()}
        />
      )}
      {attachOpen && (
        <AttachmentBrowser
          onClose={() => setAttachOpen(false)}
          onOpenThread={(id) => {
            void window.api.mail.getThread(id).then((detail) => {
              if (detail) {
                setSelectedId(id)
                setThread(detail)
              }
            })
          }}
        />
      )}
      {digestOpen && <DigestModal onClose={() => setDigestOpen(false)} />}
      {cheatOpen && <CheatSheet onClose={() => setCheatOpen(false)} />}
      {snippetMgrOpen && (
        <SnippetManager onClose={() => setSnippetMgrOpen(false)} />
      )}
      {settingsOpen && (
        <Settings
          accounts={accounts}
          onAccountsChanged={onReloadAccounts}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {compose && (
        <Compose
          accounts={accounts}
          initial={compose}
          onClose={() => setCompose(null)}
          onSent={() => void window.api.compose.getOutbox().then(setOutbox)}
        />
      )}

      <OutboxToast outbox={outbox} onUndo={(id) => window.api.compose.cancelSend(id)} />
    </div>
  )
}

function OutboxToast({
  outbox,
  onUndo
}: {
  outbox: OutboxItem[]
  onUndo: (id: string) => void
}): JSX.Element | null {
  // Re-render once a second so the undo countdown ticks down live.
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [])

  // Undo window = pending items sending within ~31s (max configurable window).
  // Scheduled sends sit further out and shouldn't show an undo toast.
  const UNDO_MAX = 31_000
  const pendingUndo = outbox.find(
    (o) =>
      o.status === 'pending' && o.sendAfter > now && o.sendAfter - now <= UNDO_MAX
  )
  const scheduled = outbox.filter(
    (o) => o.status === 'pending' && o.sendAfter - now > UNDO_MAX
  )
  const sending = outbox.find((o) => o.status === 'sending')
  const failed = outbox.find((o) => o.status === 'failed')
  const sent = outbox.find((o) => o.status === 'sent')

  if (pendingUndo) {
    const secs = Math.max(1, Math.ceil((pendingUndo.sendAfter - now) / 1000))
    return (
      <div className="toast">
        <span>Sending “{pendingUndo.subject || '(no subject)'}” · {secs}s</span>
        <button className="link-btn" onClick={() => onUndo(pendingUndo.id)}>
          undo
        </button>
      </div>
    )
  }
  if (sending) return <div className="toast">Sending…</div>
  if (scheduled.length > 0) {
    const next = scheduled.sort((a, b) => a.sendAfter - b.sendAfter)[0]
    return (
      <div className="toast">
        <span>
          ⏱ {scheduled.length} scheduled · next{' '}
          {new Date(next.sendAfter).toLocaleString([], {
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </span>
        <button className="link-btn" onClick={() => onUndo(next.id)}>
          cancel
        </button>
      </div>
    )
  }
  if (failed) {
    return (
      <div className="toast down">
        Send failed: {failed.error?.slice(0, 60) ?? 'unknown error'} (retrying)
      </div>
    )
  }
  if (sent) return <div className="toast up">Sent ✓</div>
  return null
}
