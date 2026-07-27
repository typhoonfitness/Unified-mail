import type {
  ConnectedAccount,
  MessageFilters,
  SavedSearch
} from '../../../shared/types'

export interface Selection {
  accountId?: string // undefined = all inboxes
  folder: string
  unreadOnly?: boolean
  starredOnly?: boolean
  snoozedOnly?: boolean
  followUpOnly?: boolean
  preset?:
    | 'promotions'
    | 'dated'
    | 'important'
    | 'people'
    | 'social'
    | 'accounts'
    | 'news'
}

interface Props {
  accounts: ConnectedAccount[]
  selection: Selection
  onSelect: (sel: Selection) => void
  onManageAccounts: () => void
  savedSearches: SavedSearch[]
  onApplySaved: (s: SavedSearch) => void
  onRemoveSaved: (id: string) => void
  onOpenUnsubscribe: () => void
  onOpenAttachments: () => void
  onOpenDigest: () => void
}

const FOLDERS: Array<{ id: string; label: string }> = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'sent', label: 'Sent' },
  { id: 'trash', label: 'Trash' }
]

function badgeChar(provider: string): string {
  return provider === 'google' ? 'G' : 'O'
}

export default function Sidebar({
  accounts,
  selection,
  onSelect,
  onManageAccounts,
  savedSearches,
  onApplySaved,
  onRemoveSaved,
  onOpenUnsubscribe,
  onOpenAttachments,
  onOpenDigest
}: Props): JSX.Element {
  const isAll =
    !selection.accountId &&
    !selection.starredOnly &&
    !selection.unreadOnly &&
    !selection.snoozedOnly &&
    !selection.followUpOnly &&
    !selection.preset
  return (
    <div className="pane sidebar">
      <div className="pane-head">
        <span>Mailboxes</span>
        <span className="head-actions">
          <button className="hd-act" onClick={onManageAccounts}>
            accts
          </button>
          <span className="status-dot ok" />
        </span>
      </div>

      <div className="nav-group">
        <button
          className={`nav-item ${isAll && selection.folder === 'inbox' ? 'active' : ''}`}
          onClick={() => onSelect({ folder: 'inbox' })}
        >
          ▚ All Inboxes
        </button>
        <button
          className={`nav-item ${selection.preset === 'important' ? 'active' : ''}`}
          onClick={() => onSelect({ folder: 'inbox', preset: 'important' })}
        >
          ★ Important
        </button>
        <button
          className={`nav-item ${selection.unreadOnly ? 'active' : ''}`}
          onClick={() => onSelect({ folder: 'inbox', unreadOnly: true })}
        >
          ● Unread
        </button>
        <button
          className={`nav-item ${selection.starredOnly ? 'active' : ''}`}
          onClick={() => onSelect({ folder: 'inbox', starredOnly: true })}
        >
          ★ Starred
        </button>
        <button
          className={`nav-item ${selection.snoozedOnly ? 'active' : ''}`}
          onClick={() => onSelect({ folder: 'inbox', snoozedOnly: true })}
        >
          ⏾ Snoozed
        </button>
        <button
          className={`nav-item ${selection.followUpOnly ? 'active' : ''}`}
          onClick={() => onSelect({ folder: 'inbox', followUpOnly: true })}
        >
          ↩ Follow-ups
        </button>
        <button
          className={`nav-item ${selection.folder === 'archive' ? 'active' : ''}`}
          onClick={() => onSelect({ folder: 'archive' })}
        >
          ▢ Archive
        </button>
      </div>

      <div className="nav-group">
        <div className="label">Smart</div>
        <button
          className={`nav-item ${selection.preset === 'people' ? 'active' : ''}`}
          onClick={() => onSelect({ folder: 'inbox', preset: 'people' })}
        >
          ☺ People
        </button>
        <button
          className={`nav-item ${selection.preset === 'promotions' ? 'active' : ''}`}
          onClick={() => onSelect({ folder: 'inbox', preset: 'promotions' })}
        >
          ⌾ Promotions / Ads
        </button>
        <button
          className={`nav-item ${selection.preset === 'social' ? 'active' : ''}`}
          onClick={() => onSelect({ folder: 'inbox', preset: 'social' })}
        >
          ◈ Social updates
        </button>
        <button
          className={`nav-item ${selection.preset === 'accounts' ? 'active' : ''}`}
          onClick={() => onSelect({ folder: 'inbox', preset: 'accounts' })}
        >
          ⚿ Account alerts
        </button>
        <button
          className={`nav-item ${selection.preset === 'news' ? 'active' : ''}`}
          onClick={() => onSelect({ folder: 'inbox', preset: 'news' })}
        >
          ▤ News
        </button>
        <button
          className={`nav-item ${selection.preset === 'dated' ? 'active' : ''}`}
          onClick={() => onSelect({ folder: 'inbox', preset: 'dated' })}
        >
          ▦ Has dates
        </button>
      </div>

      <div className="nav-group">
        <div className="label">Tools</div>
        <button className="nav-item" onClick={onOpenDigest}>
          ✦ AI digest
        </button>
        <button className="nav-item" onClick={onOpenUnsubscribe}>
          ⊘ Unsubscribe manager
        </button>
        <button className="nav-item" onClick={onOpenAttachments}>
          ▤ Attachments
        </button>
      </div>

      {savedSearches.length > 0 && (
        <div className="nav-group">
          <div className="label">Saved</div>
          {savedSearches.map((s) => (
            <div className="nav-item saved-item" key={s.id}>
              <button className="saved-apply" onClick={() => onApplySaved(s)}>
                ★ {s.name}
              </button>
              <button
                className="saved-del"
                title="remove"
                onClick={() => onRemoveSaved(s.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {accounts.map((acc) => (
        <div className="nav-group" key={acc.id}>
          <div className="label">
            <span className={`badge ${acc.provider}`}>
              {badgeChar(acc.provider)}
            </span>
            {acc.email}
          </div>
          {FOLDERS.map((f) => {
            const active =
              selection.accountId === acc.id &&
              selection.folder === f.id &&
              !selection.starredOnly &&
              !selection.unreadOnly
            return (
              <button
                key={f.id}
                className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => onSelect({ accountId: acc.id, folder: f.id })}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export function selectionToFilters(sel: Selection): MessageFilters {
  const broad =
    sel.starredOnly || sel.snoozedOnly || sel.followUpOnly || Boolean(sel.preset)
  return {
    accountId: sel.accountId,
    folder: broad ? undefined : sel.folder,
    unreadOnly: sel.unreadOnly,
    starredOnly: sel.starredOnly,
    snoozedOnly: sel.snoozedOnly,
    followUpOnly: sel.followUpOnly,
    preset: sel.preset,
    limit: 500
  }
}
