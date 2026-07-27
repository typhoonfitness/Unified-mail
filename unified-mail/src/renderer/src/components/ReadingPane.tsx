import { useEffect, useMemo, useRef, useState } from 'react'
import type { Attachment, Message, ThreadDetail } from '../../../shared/types'
import { addressLine, displayName, fullDate, formatBytes } from '../lib/format'
import { processEmailHtml } from '../lib/sanitizeHtml'

// Find an unsubscribe link in an email body (common in promotions).
function findUnsubscribe(html: string | null): string | null {
  if (!html) return null
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    for (const a of Array.from(doc.querySelectorAll('a'))) {
      const href = a.getAttribute('href') ?? ''
      const text = (a.textContent ?? '').toLowerCase()
      if (
        /^https?:/i.test(href) &&
        (/unsubscribe|opt[-\s]?out|manage.*preferences/i.test(text) ||
          /unsubscribe|opt[-_]?out/i.test(href))
      ) {
        return href
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

interface Props {
  thread: ThreadDetail | null
  onArchive: (messageId: string) => void
  onTrash: (messageId: string) => void
  onToggleRead: (messageId: string, read: boolean) => void
  onToggleStar: (messageId: string, starred: boolean) => void
  onReply: (messageId: string, mode: 'reply' | 'replyAll' | 'forward') => void
  onSnooze: () => void
  onRemind: () => void
  onSearchSender: (email: string) => void
  autoLoadImages: boolean
  vipSenders: string[]
  onToggleVip: (email: string) => void
}

export default function ReadingPane({
  thread,
  onArchive,
  onTrash,
  onToggleRead,
  onToggleStar,
  onReply,
  onSnooze,
  onRemind,
  onSearchSender,
  autoLoadImages,
  vipSenders,
  onToggleVip
}: Props): JSX.Element {
  const [summary, setSummary] = useState<string | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const threadId = thread?.id
  // Clear any AI summary when switching threads.
  useEffect(() => {
    setSummary(null)
    setAiError(null)
    setAiBusy(false)
  }, [threadId])

  const runSummarize = async (): Promise<void> => {
    if (!threadId) return
    setAiBusy(true)
    setAiError(null)
    const res = await window.api.ai.summarize(threadId)
    setAiBusy(false)
    if (res.ok) setSummary(res.text ?? '')
    else setAiError(res.error ?? 'AI request failed')
  }

  if (!thread) {
    return (
      <div className="pane reader">
        <div className="pane-head">
          <span>Message</span>
          <span className="status-dot" />
        </div>
        <div className="empty">— select a message —</div>
      </div>
    )
  }

  const latest = thread.messages[thread.messages.length - 1]

  return (
    <div className="pane reader">
      <div className="pane-head">
        <span>Message</span>
        <span className="head-actions">
          <button className="hd-act" onClick={() => onReply(latest.id, 'reply')}>
            reply
          </button>
          <button className="hd-act" onClick={onSnooze}>
            snooze
          </button>
          <span className="status-dot ok" />
        </span>
      </div>
      <div className="subject-line">{thread.subject || '(no subject)'}</div>
      <div className="toolbar">
        <button className="tbtn" onClick={() => onReply(latest.id, 'reply')}>
          Reply
        </button>
        <button className="tbtn" onClick={() => onReply(latest.id, 'replyAll')}>
          Reply All
        </button>
        <button className="tbtn" onClick={() => onReply(latest.id, 'forward')}>
          Forward
        </button>
        <button className="tbtn" onClick={() => onArchive(latest.id)}>
          Archive
        </button>
        <button className="tbtn" onClick={onSnooze}>
          Snooze
        </button>
        <button className="tbtn" onClick={onRemind} title="Remind me if no reply">
          Remind
        </button>
        <button
          className="tbtn"
          onClick={() => onToggleRead(latest.id, !latest.isRead)}
        >
          {latest.isRead ? 'Mark Unread' : 'Mark Read'}
        </button>
        <button
          className="tbtn"
          onClick={() => onToggleStar(latest.id, !latest.isStarred)}
        >
          {latest.isStarred ? 'Unstar' : 'Star'}
        </button>
        <button className="tbtn danger" onClick={() => onTrash(latest.id)}>
          Delete
        </button>
        <button className="tbtn ai" onClick={runSummarize} disabled={aiBusy}>
          {aiBusy ? 'Summarizing…' : '✦ Summarize'}
        </button>
      </div>

      {(summary || aiError) && (
        <div className={`ai-panel${aiError ? ' error' : ''}`}>
          <div className="ai-panel-head">
            <span>{aiError ? 'AI error' : '✦ Summary'}</span>
            <button
              className="hd-act"
              onClick={() => {
                setSummary(null)
                setAiError(null)
              }}
            >
              ×
            </button>
          </div>
          <div className="ai-panel-body">{aiError ?? summary}</div>
        </div>
      )}

      {thread.messages.map((m) => (
        <MessageBlock
          key={m.id}
          message={m}
          onSearchSender={onSearchSender}
          autoLoadImages={autoLoadImages}
          isVip={
            !!m.from &&
            vipSenders.some(
              (v) => v.toLowerCase() === m.from!.email.toLowerCase()
            )
          }
          onToggleVip={onToggleVip}
        />
      ))}
    </div>
  )
}

function MessageBlock({
  message,
  onSearchSender,
  autoLoadImages,
  isVip,
  onToggleVip
}: {
  message: Message
  onSearchSender: (email: string) => void
  autoLoadImages: boolean
  isVip: boolean
  onToggleVip: (email: string) => void
}): JSX.Element {
  const [loadImages, setLoadImages] = useState(autoLoadImages)
  const [attachments, setAttachments] = useState<Attachment[]>(
    message.attachments
  )
  const unsubUrl = useMemo(
    () => findUnsubscribe(message.bodyHtml),
    [message.bodyHtml]
  )

  // Lazily hydrate attachment metadata (Outlook doesn't include it at sync).
  useEffect(() => {
    let cancelled = false
    if (message.hasAttachments && attachments.length === 0) {
      window.api.mail.getAttachments(message.id).then((list) => {
        if (!cancelled) setAttachments(list)
      })
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.id])

  return (
    <div className="msg">
      <div className="meta">
        {message.from?.email && (
          <button
            className={`vip-toggle ${isVip ? 'on' : ''}`}
            title={isVip ? 'remove VIP' : 'mark sender as VIP (Important)'}
            onClick={() => onToggleVip(message.from!.email)}
          >
            {isVip ? '★' : '☆'}
          </button>
        )}
        <span className="from">{displayName(message.from)}</span>
        {message.from?.email && (
          <button
            className="addr addr-link"
            title="find all mail from this sender"
            onClick={() => onSearchSender(message.from!.email)}
          >
            {message.from.email}
          </button>
        )}
        <span className="when">{fullDate(message.receivedAt)}</span>
      </div>
      {message.to.length > 0 && (
        <div className="to-line">to {addressLine(message.to)}</div>
      )}
      {unsubUrl && (
        <button
          className="unsub-btn"
          title="open the unsubscribe page"
          onClick={() => window.open(unsubUrl, '_blank')}
        >
          ⊘ Unsubscribe
        </button>
      )}
      <MessageBody
        message={message}
        loadImages={loadImages}
        onLoadImages={() => setLoadImages(true)}
      />
      {attachments.length > 0 && (
        <div className="attachments">
          <div className="h">Attachments</div>
          {attachments.map((a) => (
            <div className="attach" key={a.id}>
              <span className="paperclip">📎</span>
              <span>{a.filename}</span>
              <span className="faint">{formatBytes(a.size)}</span>
              <button
                onClick={() =>
                  window.api.mail.downloadAttachment(message.id, a.id)
                }
              >
                Download
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MessageBody({
  message,
  loadImages,
  onLoadImages
}: {
  message: Message
  loadImages: boolean
  onLoadImages: () => void
}): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const processed = useMemo(() => {
    if (message.bodyHtml) return processEmailHtml(message.bodyHtml, loadImages)
    return null
  }, [message.bodyHtml, loadImages])

  // Auto-size the iframe to its content height.
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    const resize = (): void => {
      try {
        const doc = iframe.contentDocument
        if (doc) iframe.style.height = `${doc.body.scrollHeight + 24}px`
      } catch {
        /* cross-origin guard; srcdoc is same-origin so this is safe */
      }
    }
    iframe.addEventListener('load', resize)
    const t = setTimeout(resize, 60)
    return () => {
      iframe.removeEventListener('load', resize)
      clearTimeout(t)
    }
  }, [processed])

  if (!message.bodyHtml) {
    return <div className="mail-text">{message.bodyText || message.snippet}</div>
  }

  return (
    <>
      {processed && processed.blockedImages > 0 && !loadImages && (
        <div className="imgbar">
          <span>
            ⚠ {processed.blockedImages} remote image
            {processed.blockedImages > 1 ? 's' : ''} blocked
          </span>
          <button onClick={onLoadImages}>Load images</button>
        </div>
      )}
      <iframe
        ref={iframeRef}
        className="mail-frame"
        style={{ minHeight: 80 }}
        // No allow-scripts/allow-forms, so active content can't run. We DO allow
        // popups so links (target=_blank) open — the main process intercepts the
        // popup and opens the URL in the system browser. allow-same-origin lets
        // the parent measure height for auto-sizing.
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={processed?.html ?? ''}
        title={`message-${message.id}`}
      />
    </>
  )
}
