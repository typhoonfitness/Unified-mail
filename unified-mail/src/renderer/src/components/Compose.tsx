import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import type {
  ConnectedAccount,
  Draft,
  Signature,
  Snippet
} from '../../../shared/types'
import Palette, { type PaletteItem } from './Palette'
import RecipientInput from './RecipientInput'

interface Props {
  accounts: ConnectedAccount[]
  initial: Draft
  onClose: () => void
  onSent: (outboxId: string) => void
}

export default function Compose({
  accounts,
  initial,
  onClose,
  onSent
}: Props): JSX.Element {
  const [draft, setDraft] = useState<Draft>(initial)
  const [showCc, setShowCc] = useState(
    Boolean(initial.cc || initial.bcc)
  )
  const [sending, setSending] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [signatures, setSignatures] = useState<Signature[]>([])
  const [sigOpen, setSigOpen] = useState(false)
  const [slashOpen, setSlashOpen] = useState(false)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const sigInsertedRef = useRef(false)

  useEffect(() => {
    void window.api.snippets.list().then(setSnippets)
    void window.api.settings.get().then((s) => setSignatures(s.signatureList))
  }, [])

  const editor = useEditor({
    extensions: [StarterKit],
    content: initial.bodyHtml || '<p></p>',
    onUpdate: ({ editor }) => {
      setDraft((d) => ({ ...d, bodyHtml: editor.getHTML() }))
    }
  })

  // Signatures available for the current account (account-specific + global).
  const applicableSignatures = useMemo(
    () =>
      signatures.filter(
        (s) => s.accountId === null || s.accountId === draft.accountId
      ),
    [signatures, draft.accountId]
  )

  const sigHtml = (html: string): string =>
    `<p></p><div data-signature="1">${html.replace(/\n/g, '<br>')}</div>`

  // Auto-insert the default signature once, for brand-new messages.
  useEffect(() => {
    if (!editor || sigInsertedRef.current) return
    if (initial.mode !== 'new') return
    const def = applicableSignatures.find((s) => s.isDefault)
    if (!def) return
    sigInsertedRef.current = true
    editor.chain().focus('end').insertContent(sigHtml(def.html)).run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, applicableSignatures])

  const insertSignature = (s: Signature): void => {
    if (!editor) return
    editor.chain().focus('end').insertContent(sigHtml(s.html)).run()
    setSigOpen(false)
  }

  const patch = useCallback((p: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...p }))
  }, [])

  // Autosave every 2s while there are unsaved edits.
  useEffect(() => {
    const t = setInterval(() => {
      void window.api.compose.saveDraft(draftRef.current)
    }, 2000)
    return () => {
      clearInterval(t)
      // Final save on unmount.
      void window.api.compose.saveDraft(draftRef.current)
    }
  }, [])

  const [laterOpen, setLaterOpen] = useState(false)

  const doSend = useCallback(
    async (sendAt?: number) => {
      if (sending) return
      setSending(true)
      const res = await window.api.compose.send(draftRef.current, sendAt)
      if (res.ok && res.outboxId) {
        onSent(res.outboxId)
        onClose()
      } else {
        setSending(false)
        alert(res.error ?? 'Send failed')
      }
    },
    [sending, onSent, onClose]
  )

  // "Send later" presets.
  const laterOptions = useMemo(() => {
    const now = new Date()
    const atHour = (base: Date, h: number): Date => {
      const d = new Date(base)
      d.setHours(h, 0, 0, 0)
      return d
    }
    const tonight = atHour(now, 18)
    const tomorrow = atHour(new Date(now.getTime() + 86400000), 8)
    const monday = atHour(now, 8)
    const daysToMon = (1 - now.getDay() + 7) % 7 || 7
    monday.setDate(monday.getDate() + daysToMon)
    return [
      { label: 'In 1 hour', at: now.getTime() + 3600000 },
      { label: 'This evening (6pm)', at: tonight.getTime() },
      { label: 'Tomorrow 8am', at: tomorrow.getTime() },
      { label: 'Monday 8am', at: monday.getTime() }
    ].filter((o) => o.at > now.getTime())
  }, [])

  // Keyboard: Cmd/Ctrl+Enter sends, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        void doSend()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doSend, onClose])

  const addFiles = async (): Promise<void> => {
    const files = await window.api.compose.pickFiles()
    if (files.length) patch({ attachments: [...draft.attachments, ...files] })
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    const dropped: typeof draft.attachments = []
    for (const f of Array.from(e.dataTransfer.files)) {
      // Electron exposes the absolute path on dropped File objects.
      const path = (f as File & { path?: string }).path
      if (path) {
        dropped.push({
          name: f.name,
          path,
          size: f.size,
          mimeType: f.type || 'application/octet-stream'
        })
      }
    }
    if (dropped.length) patch({ attachments: [...draft.attachments, ...dropped] })
  }

  const removeAttachment = (path: string): void => {
    patch({ attachments: draft.attachments.filter((a) => a.path !== path) })
  }

  // Open the snippet picker when "/" is typed at the start of a word.
  const onEditorKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key !== '/' || !editor) return
    const { from } = editor.state.selection
    const before = from > 1 ? editor.state.doc.textBetween(from - 1, from) : ''
    const atWordStart = before === '' || /\s/.test(before)
    if (atWordStart && snippets.length > 0) {
      e.preventDefault()
      setSlashOpen(true)
    }
  }

  const snippetItems: PaletteItem[] = snippets.map((s) => ({
    id: s.id,
    label: s.name,
    hint: `/${s.keyword}`,
    run: () => editor?.chain().focus().insertContent(s.bodyHtml).run()
  }))

  // Draft a reply with AI, based on the message being replied to. Optional
  // instructions steer tone/content. Inserts the result at the top of the body.
  const draftWithAi = async (): Promise<void> => {
    if (!editor || !draft.inReplyToMessageId || aiBusy) return
    const instructions =
      window.prompt(
        'How should the reply go? (optional — e.g. "politely decline", "confirm Tuesday")'
      ) ?? ''
    setAiBusy(true)
    const res = await window.api.ai.draftReply(
      draft.inReplyToMessageId,
      instructions
    )
    setAiBusy(false)
    if (!res.ok) {
      alert(res.error ?? 'AI request failed')
      return
    }
    const html = (res.text ?? '')
      .split(/\n{2,}/)
      .map((p) => `<p>${p.replace(/\n/g, '<br>').replace(/</g, '&lt;')}</p>`)
      .join('')
    editor.chain().focus('start').insertContent(html).run()
  }

  const discard = async (): Promise<void> => {
    await window.api.compose.deleteDraft(draft.id)
    onClose()
  }

  const title =
    draft.mode === 'forward'
      ? 'Forward'
      : draft.mode === 'reply' || draft.mode === 'replyAll'
        ? 'Reply'
        : 'New Message'

  return (
    <div className="compose-overlay" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <div className="compose">
        <div className="compose-head">
          <span>{title}</span>
          <span className="spacer" />
          <button className="link-btn" onClick={onClose}>
            minimize
          </button>
          <button className="link-btn" onClick={discard}>
            discard
          </button>
        </div>

        <div className="compose-row">
          <label>FROM</label>
          <select
            value={draft.accountId}
            onChange={(e) => patch({ accountId: e.target.value })}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email} ({a.provider === 'google' ? 'Gmail' : 'Outlook'})
              </option>
            ))}
          </select>
        </div>

        <div className="compose-row">
          <label>TO</label>
          <RecipientInput
            value={draft.to}
            onChange={(v) => patch({ to: v })}
            placeholder="recipient@example.com, …"
          />
          <button className="link-btn" onClick={() => setShowCc((v) => !v)}>
            cc/bcc
          </button>
        </div>

        {showCc && (
          <>
            <div className="compose-row">
              <label>CC</label>
              <RecipientInput value={draft.cc} onChange={(v) => patch({ cc: v })} />
            </div>
            <div className="compose-row">
              <label>BCC</label>
              <RecipientInput
                value={draft.bcc}
                onChange={(v) => patch({ bcc: v })}
              />
            </div>
          </>
        )}

        <div className="compose-row">
          <label>SUBJ</label>
          <input
            value={draft.subject}
            onChange={(e) => patch({ subject: e.target.value })}
            placeholder="subject"
          />
        </div>

        <div className="compose-toolbar">
          <button
            className="fmt"
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            B
          </button>
          <button
            className="fmt italic"
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            I
          </button>
          <button
            className="fmt"
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            • list
          </button>
          <button
            className="fmt"
            onClick={() =>
              editor?.chain().focus().toggleHeading({ level: 2 }).run()
            }
          >
            H
          </button>
          <span className="spacer" />
          {applicableSignatures.length > 0 && (
            <div className="later-wrap">
              <button
                className="link-btn"
                onClick={() => setSigOpen((v) => !v)}
              >
                ✎ signature ▾
              </button>
              {sigOpen && (
                <div className="later-menu">
                  {applicableSignatures.map((s) => (
                    <button
                      key={s.id}
                      className="later-opt"
                      onClick={() => insertSignature(s)}
                    >
                      <span>{s.name}</span>
                      {s.isDefault && <span className="faint">default</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {draft.inReplyToMessageId && (
            <button className="link-btn ai" onClick={draftWithAi} disabled={aiBusy}>
              {aiBusy ? '✦ drafting…' : '✦ AI draft'}
            </button>
          )}
          <button className="link-btn" onClick={addFiles}>
            + attach
          </button>
        </div>

        <div className="compose-body" onKeyDown={onEditorKeyDown}>
          <EditorContent editor={editor} />
        </div>

        {slashOpen && (
          <Palette
            title="snippets"
            placeholder="insert snippet…"
            items={snippetItems}
            onClose={() => setSlashOpen(false)}
          />
        )}

        {draft.attachments.length > 0 && (
          <div className="compose-attachments">
            {draft.attachments.map((a) => (
              <span className="chip" key={a.path}>
                📎 {a.name}
                <button onClick={() => removeAttachment(a.path)}>×</button>
              </span>
            ))}
          </div>
        )}

        <div className="compose-foot">
          <button
            className="btn"
            onClick={() => void doSend()}
            disabled={sending}
          >
            {sending ? 'Queuing…' : 'Send'}
          </button>
          <div className="later-wrap">
            <button
              className="btn ghost"
              onClick={() => setLaterOpen((v) => !v)}
              disabled={sending}
            >
              Later ▾
            </button>
            {laterOpen && (
              <div className="later-menu">
                {laterOptions.map((o) => (
                  <button
                    key={o.label}
                    className="later-opt"
                    onClick={() => {
                      setLaterOpen(false)
                      void doSend(o.at)
                    }}
                  >
                    <span>{o.label}</span>
                    <span className="faint">
                      {new Date(o.at).toLocaleString([], {
                        weekday: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="faint" style={{ fontSize: 11, letterSpacing: 1 }}>
            ⌘/Ctrl+Enter to send · Esc to close
          </span>
        </div>
      </div>
    </div>
  )
}
