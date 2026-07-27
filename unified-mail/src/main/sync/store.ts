// Message/thread persistence and read queries over the local SQLite cache.
// The renderer only ever reads through these (via IPC), so the UI never waits
// on the network.

import type Database from 'better-sqlite3'
import { getDb } from '../db'
import type {
  Address,
  Attachment,
  Message,
  MessageFilters,
  ThreadDetail,
  ThreadSummary,
  Provider
} from '@shared/types'
import type { NormalizedMessage } from './types'

// ---------- writes ----------

export function upsertMessages(messages: NormalizedMessage[]): void {
  if (messages.length === 0) return
  const db = getDb()
  const stmt = db.prepare(`
    INSERT INTO messages (
      id, account_id, provider, provider_message_id, provider_thread_id,
      unified_thread_id, from_name, from_email, to_json, cc_json, subject,
      snippet, body_html, body_text, received_at, is_read, is_starred,
      folder, labels_json, has_attachments, attachments_json, bulk, unsubscribe
    ) VALUES (
      @id, @accountId, @provider, @providerMessageId, @providerThreadId,
      @unifiedThreadId, @fromName, @fromEmail, @toJson, @ccJson, @subject,
      @snippet, @bodyHtml, @bodyText, @receivedAt, @isRead, @isStarred,
      @folder, @labelsJson, @hasAttachments, @attachmentsJson, @bulk, @unsubscribe
    )
    ON CONFLICT(id) DO UPDATE SET
      bulk              = excluded.bulk,
      unsubscribe       = excluded.unsubscribe,
      unified_thread_id = excluded.unified_thread_id,
      subject           = excluded.subject,
      snippet           = excluded.snippet,
      body_html         = excluded.body_html,
      body_text         = excluded.body_text,
      received_at       = excluded.received_at,
      is_read           = excluded.is_read,
      is_starred        = excluded.is_starred,
      folder            = excluded.folder,
      labels_json       = excluded.labels_json,
      has_attachments   = excluded.has_attachments,
      attachments_json  = excluded.attachments_json,
      to_json           = excluded.to_json,
      cc_json           = excluded.cc_json,
      from_name         = excluded.from_name,
      from_email        = excluded.from_email
  `)

  const affectedThreads = new Set<string>()
  const tx = db.transaction((rows: NormalizedMessage[]) => {
    for (const m of rows) {
      const id = `${m.accountId}::${m.providerMessageId}`
      stmt.run({
        id,
        accountId: m.accountId,
        provider: m.provider,
        providerMessageId: m.providerMessageId,
        providerThreadId: m.providerThreadId,
        unifiedThreadId: m.unifiedThreadId,
        fromName: m.from?.name ?? null,
        fromEmail: m.from?.email ?? null,
        toJson: JSON.stringify(m.to),
        ccJson: JSON.stringify(m.cc),
        subject: m.subject,
        snippet: m.snippet,
        bodyHtml: m.bodyHtml,
        bodyText: m.bodyText,
        receivedAt: m.receivedAt,
        isRead: m.isRead ? 1 : 0,
        isStarred: m.isStarred ? 1 : 0,
        folder: m.folder,
        labelsJson: JSON.stringify(m.labels),
        hasAttachments: m.hasAttachments ? 1 : 0,
        attachmentsJson: JSON.stringify(m.attachments ?? []),
        bulk: m.bulk ? 1 : 0,
        unsubscribe: m.unsubscribe ?? null
      })
      updateFts(db, id, {
        subject: m.subject,
        snippet: m.snippet,
        body: m.bodyText ?? stripHtml(m.bodyHtml),
        sender: `${m.from?.name ?? ''} ${m.from?.email ?? ''}`.trim()
      })
      affectedThreads.add(m.unifiedThreadId)
    }
  })
  tx(messages)
  for (const t of affectedThreads) recomputeThread(db, t)
}

// ---------- full-text search maintenance ----------

function stripHtml(html: string | null): string {
  if (!html) return ''
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function updateFts(
  db: Database.Database,
  msgId: string,
  fields: { subject: string; snippet: string; body: string; sender: string }
): void {
  db.prepare(`DELETE FROM messages_fts WHERE msg_id = ?`).run(msgId)
  db.prepare(
    `INSERT INTO messages_fts (msg_id, subject, snippet, body, sender)
     VALUES (@msgId, @subject, @snippet, @body, @sender)`
  ).run({ msgId, ...fields })
}

// Turn a free-text query into a safe FTS5 MATCH expression: each token becomes
// a prefix match, combined with AND. Quoting neutralizes FTS operators.
function toFtsQuery(search: string): string {
  const tokens = search
    .toLowerCase()
    .replace(/["*()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (tokens.length === 0) return ''
  return tokens.map((t) => `"${t}"*`).join(' AND ')
}

// Store a freshly-hydrated attachment list for a message (used for Outlook).
export function setAttachments(
  messageId: string,
  attachments: Attachment[]
): void {
  const db = getDb()
  db.prepare(
    `UPDATE messages SET attachments_json = ?, has_attachments = ? WHERE id = ?`
  ).run(JSON.stringify(attachments), attachments.length > 0 ? 1 : 0, messageId)
}

// Move a whole thread to (or from) the shared Archive. Local flag preserved
// across sync because upsertMessages never overwrites `archived`.
export function archiveThread(messageId: string, archived: boolean): string | null {
  const db = getDb()
  const row = db
    .prepare(`SELECT unified_thread_id AS t FROM messages WHERE id = ?`)
    .get(messageId) as { t: string } | undefined
  if (!row) return null
  db.prepare(`UPDATE messages SET archived = ? WHERE unified_thread_id = ?`).run(
    archived ? 1 : 0,
    row.t
  )
  recomputeThread(db, row.t)
  return row.t
}

// Remove a message locally (used by trash optimistic updates).
export function removeMessageLocal(messageId: string): string | null {
  const db = getDb()
  const row = db
    .prepare(`SELECT unified_thread_id AS t FROM messages WHERE id = ?`)
    .get(messageId) as { t: string } | undefined
  db.prepare(`DELETE FROM messages WHERE id = ?`).run(messageId)
  db.prepare(`DELETE FROM messages_fts WHERE msg_id = ?`).run(messageId)
  if (row) {
    recomputeThread(db, row.t)
    return row.t
  }
  return null
}

export function deleteMessagesByProviderIds(
  accountId: string,
  providerMessageIds: string[]
): void {
  if (providerMessageIds.length === 0) return
  const db = getDb()
  const affected = new Set<string>()
  const findThread = db.prepare(
    `SELECT unified_thread_id AS t FROM messages WHERE id = ?`
  )
  const del = db.prepare(`DELETE FROM messages WHERE id = ?`)
  const delFts = db.prepare(`DELETE FROM messages_fts WHERE msg_id = ?`)
  const tx = db.transaction((ids: string[]) => {
    for (const pid of ids) {
      const id = `${accountId}::${pid}`
      const row = findThread.get(id) as { t: string } | undefined
      if (row) affected.add(row.t)
      del.run(id)
      delFts.run(id)
    }
  })
  tx(providerMessageIds)
  for (const t of affected) recomputeThread(db, t)
}

// Local mutations used by the IPC action handlers (optimistic updates).
export function setReadLocal(messageId: string, read: boolean): string | null {
  const db = getDb()
  db.prepare(`UPDATE messages SET is_read = ? WHERE id = ?`).run(
    read ? 1 : 0,
    messageId
  )
  return refreshThreadForMessage(db, messageId)
}

export function setStarredLocal(
  messageId: string,
  starred: boolean
): string | null {
  const db = getDb()
  db.prepare(`UPDATE messages SET is_starred = ? WHERE id = ?`).run(
    starred ? 1 : 0,
    messageId
  )
  return refreshThreadForMessage(db, messageId)
}

function refreshThreadForMessage(
  db: Database.Database,
  messageId: string
): string | null {
  const row = db
    .prepare(`SELECT unified_thread_id AS t FROM messages WHERE id = ?`)
    .get(messageId) as { t: string } | undefined
  if (!row) return null
  recomputeThread(db, row.t)
  return row.t
}

// Recompute the aggregate `threads` row from its messages.
function recomputeThread(db: Database.Database, threadId: string): void {
  const rows = db
    .prepare(
      `SELECT id, account_id, provider, subject, snippet, received_at,
              is_read, is_starred, from_name, from_email, to_json, cc_json
         FROM messages WHERE unified_thread_id = ? ORDER BY received_at ASC`
    )
    .all(threadId) as Array<{
    id: string
    account_id: string
    provider: Provider
    subject: string
    snippet: string
    received_at: number
    is_read: number
    is_starred: number
    from_name: string | null
    from_email: string | null
    to_json: string
    cc_json: string
  }>

  if (rows.length === 0) {
    db.prepare(`DELETE FROM threads WHERE id = ?`).run(threadId)
    return
  }

  const last = rows[rows.length - 1]
  const accountIds = Array.from(new Set(rows.map((r) => r.account_id)))
  const providers = Array.from(new Set(rows.map((r) => r.provider)))
  const unread = rows.filter((r) => r.is_read === 0).length
  const hasStarred = rows.some((r) => r.is_starred === 1)

  // Participant set across the thread.
  const participants = new Map<string, Address>()
  for (const r of rows) {
    if (r.from_email) {
      participants.set(r.from_email.toLowerCase(), {
        name: r.from_name,
        email: r.from_email
      })
    }
    for (const key of ['to_json', 'cc_json'] as const) {
      const list = JSON.parse(r[key]) as Address[]
      for (const a of list) {
        if (a.email) participants.set(a.email.toLowerCase(), a)
      }
    }
  }

  db.prepare(
    `INSERT INTO threads (
        id, subject, snippet, last_message_at, last_message_id, message_count,
        unread_count, has_starred, participants_json, account_ids_json, providers_json
     ) VALUES (
        @id, @subject, @snippet, @lastAt, @lastId, @count, @unread,
        @hasStarred, @participants, @accountIds, @providers
     )
     ON CONFLICT(id) DO UPDATE SET
        subject = excluded.subject,
        snippet = excluded.snippet,
        last_message_at = excluded.last_message_at,
        last_message_id = excluded.last_message_id,
        message_count = excluded.message_count,
        unread_count = excluded.unread_count,
        has_starred = excluded.has_starred,
        participants_json = excluded.participants_json,
        account_ids_json = excluded.account_ids_json,
        providers_json = excluded.providers_json`
  ).run({
    id: threadId,
    subject: last.subject,
    snippet: last.snippet,
    lastAt: last.received_at,
    lastId: last.id,
    count: rows.length,
    unread,
    hasStarred: hasStarred ? 1 : 0,
    participants: JSON.stringify([...participants.values()]),
    accountIds: JSON.stringify(accountIds),
    providers: JSON.stringify(providers)
  })
}

// ---------- reads ----------

interface MessageRow {
  id: string
  account_id: string
  provider: Provider
  provider_message_id: string
  provider_thread_id: string
  unified_thread_id: string
  from_name: string | null
  from_email: string | null
  to_json: string
  cc_json: string
  subject: string
  snippet: string
  body_html: string | null
  body_text: string | null
  received_at: number
  is_read: number
  is_starred: number
  folder: string
  labels_json: string
  has_attachments: number
  attachments_json: string
  bulk: number
  unsubscribe: string | null
}

function rowToMessage(r: MessageRow): Message {
  return {
    id: r.id,
    accountId: r.account_id,
    provider: r.provider,
    providerMessageId: r.provider_message_id,
    providerThreadId: r.provider_thread_id,
    unifiedThreadId: r.unified_thread_id,
    from: r.from_email ? { name: r.from_name, email: r.from_email } : null,
    to: JSON.parse(r.to_json) as Address[],
    cc: JSON.parse(r.cc_json) as Address[],
    subject: r.subject,
    snippet: r.snippet,
    bodyHtml: r.body_html,
    bodyText: r.body_text,
    receivedAt: r.received_at,
    isRead: r.is_read === 1,
    isStarred: r.is_starred === 1,
    folder: r.folder,
    labels: JSON.parse(r.labels_json) as string[],
    hasAttachments: r.has_attachments === 1,
    attachments: JSON.parse(r.attachments_json ?? '[]') as Attachment[],
    bulk: r.bulk === 1,
    unsubscribe: r.unsubscribe ?? null
  }
}

// A real person's display name: at least two capitalized words (First Last),
// optionally quoted, allowing initials/hyphens/apostrophes.
const PERSON_NAME_REGEX =
  "^\\s*\"?[A-Za-z][A-Za-z.'\\-]+\\s+[A-Za-z][A-Za-z.'\\-]+"

// Role / bulk / company indicators — if the sender's name OR email contains any
// of these, it's treated as an organization, not a person. This is what keeps
// brands with human-sounding names (e.g. "Calvin Klein" from noreply@) out.
// NOTE: this is matched against the email's LOCAL part (before @) and the
// display name — never the domain, so a real person at company.com still counts.
const ROLE_REGEX =
  '\\b(no-?reply|do-?not-?reply|donotreply|newsletter|marketing|notification|' +
  'notifications|updates?|alerts?|team|support|sales|info|hello|contact|billing|' +
  'receipts?|orders?|account|accounts|mailer|bounce|store|shop|rewards|deals?|' +
  'offers?|promo|promotions?|news|press|help|service|customer|inc|llc|ltd|corp)\\b'

// Organization / brand / newsletter words that, if present in the DISPLAY NAME,
// mark the sender as not-a-person (e.g. "American Airlines", "New York Times
// Games", "Downriver and Friends on Facebook", "Microsoft Azure").
const NAME_ORG_REGEX =
  '\\b(facebook|twitter|linkedin|instagram|substack|azure|microsoft|google|' +
  'apple|amazon|paypal|netflix|spotify|youtube|reddit|airlines?|times|games?|' +
  'program|programs?|trending|posts?|weekly|daily|digest|rewards|newsletter|' +
  'team|store|shop|news|alerts?|updates?|notifications?|deals?|offers?|club|' +
  'group|community|friends|official|magazine|media|studios?|labs?|bank|' +
  'insurance|mortgage|university|college|academy|foundation|company|and|&)\\b'

// Social-media platforms — matched against the sender name AND email so both
// "Facebook <noreply@facebookmail.com>" and "reddit@redditmail.com" are caught.
const SOCIAL_REGEX =
  '\\b(facebook|facebookmail|instagram|threads|meta|reddit|redditmail|substack|' +
  'tiktok|linkedin|twitter|discord|pinterest|snapchat|tumblr|mastodon|bluesky|' +
  'youtube|twitch|quora|nextdoor|whatsapp|telegram|patreon|onlyfans|goodreads)\\b'

// Account / security-alert senders: the big identity providers.
const ACCOUNT_NAME_REGEX =
  '\\b(microsoft|microsoft account|google|apple|apple id|okta|duo|dropbox|' +
  'github|slack|zoom|amazon|paypal|authenticator|account team|security team)\\b'

// Account / security-alert wording in the subject or preview.
const ACCOUNT_SUBJECT_REGEX =
  '\\b(security alert|sign-?in|signed in|verification code|verify your|' +
  'password|two-?factor|2fa|one-?time|otp|suspicious|new device|new sign-?in|' +
  'account activity|log ?in|was blocked|recovery|authenticator|' +
  'confirm your email|unusual activity|reset your)\\b'

// News publishers — matched against sender name AND email.
const NEWS_REGEX =
  '\\b(new york times|nytimes|nyt|washington post|washingtonpost|wapo|' +
  'associated press|ap news|apnews|reuters|bloomberg|the guardian|guardian|' +
  'bbc|cnn|npr|wall street journal|wsj|the economist|economist|politico|axios|' +
  'the atlantic|the verge|techcrunch|financial times|forbes|business insider|' +
  'usa today|los angeles times|latimes|the hill|vox|cnbc|fox news|msnbc|' +
  'the daily|morning brew|semafor|substack|newsletter|the athletic|propublica)\\b'

// Matches common date forms: 1/5, 01/05/2025, 2025-01-05, "Jan 5", "January 5th".
const DATE_REGEX =
  '(\\b\\d{1,2}[\\/\\-.]\\d{1,2}([\\/\\-.]\\d{2,4})?\\b)' +
  '|(\\b\\d{4}-\\d{2}-\\d{2}\\b)' +
  '|(\\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?\\s+\\d{1,2}(st|nd|rd|th)?\\b)'

function buildWhere(f: MessageFilters): {
  clause: string
  params: Record<string, unknown>
} {
  const conds: string[] = []
  const params: Record<string, unknown> = {}
  if (f.accountId) {
    conds.push('account_id = @accountId')
    params.accountId = f.accountId
  }
  if (f.provider) {
    conds.push('provider = @provider')
    params.provider = f.provider
  }
  // Shared Archive is a local flag, not a provider folder.
  if (f.folder === 'archive') {
    conds.push('archived = 1')
  } else {
    conds.push('archived = 0')
    if (f.folder) {
      conds.push('folder = @folder')
      params.folder = f.folder
    }
  }
  if (f.unreadOnly) conds.push('is_read = 0')
  if (f.starredOnly) conds.push('is_starred = 1')

  // Smart preset: promotions / ads. Gmail tags these CATEGORY_PROMOTIONS;
  // for Outlook (and as a backstop) match newsletter senders + promo wording.
  if (f.preset === 'promotions') {
    conds.push(`(
      bulk = 1
      OR labels_json LIKE '%CATEGORY_PROMOTIONS%'
      OR labels_json LIKE '%CATEGORY_SOCIAL%'
      OR labels_json LIKE '%CATEGORY_UPDATES%'
      OR labels_json LIKE '%CATEGORY_FORUMS%'
      OR IFNULL(from_name,'') REGEXP @orgre
      OR from_email LIKE '%newsletter%'
      OR from_email LIKE '%noreply%'
      OR from_email LIKE '%no-reply%'
      OR from_email LIKE '%donotreply%'
      OR from_email LIKE '%marketing%'
      OR from_email LIKE '%@email.%'
      OR from_email LIKE '%@e.%'
      OR from_email LIKE '%@mail.%'
      OR from_email LIKE '%@news.%'
      OR from_email LIKE '%@info.%'
      OR subject LIKE '%unsubscribe%'
      OR subject LIKE '%discount%'
      OR subject LIKE '%% off%'
      OR subject LIKE '%sale%'
      OR subject LIKE '%deal%'
      OR subject LIKE '%coupon%'
      OR subject LIKE '%promo%'
      OR subject LIKE '%offer%'
      OR snippet LIKE '%unsubscribe%'
    )`)
    params.orgre = NAME_ORG_REGEX
  }

  // Smart preset: emails whose subject/body contain a date.
  if (f.preset === 'dated') {
    conds.push(
      `(subject REGEXP @datere OR snippet REGEXP @datere OR IFNULL(body_text,'') REGEXP @datere)`
    )
    params.datere = DATE_REGEX
  }

  // Smart preset: People — mail from actual humans, not companies/orgs.
  if (f.preset === 'people') {
    conds.push(
      `(from_name REGEXP @personre
        AND NOT (IFNULL(from_name,'') REGEXP @rolere)
        AND NOT (IFNULL(from_name,'') REGEXP @orgre)
        AND NOT (substr(IFNULL(from_email,''), 1, instr(IFNULL(from_email,'') || '@', '@') - 1) REGEXP @rolere)
        AND bulk = 0
        AND labels_json NOT LIKE '%CATEGORY_PROMOTIONS%'
        AND labels_json NOT LIKE '%CATEGORY_SOCIAL%'
        AND labels_json NOT LIKE '%CATEGORY_UPDATES%'
        AND labels_json NOT LIKE '%CATEGORY_FORUMS%')`
    )
    params.personre = PERSON_NAME_REGEX
    params.rolere = ROLE_REGEX
    params.orgre = NAME_ORG_REGEX
  }

  // Smart preset: Social — updates from social-media platforms.
  if (f.preset === 'social') {
    conds.push(
      `(labels_json LIKE '%CATEGORY_SOCIAL%'
        OR IFNULL(from_name,'') REGEXP @socialre
        OR IFNULL(from_email,'') REGEXP @socialre
        OR from_email LIKE '%@x.com%'
        OR from_email LIKE '%@mail.x.com%')`
    )
    params.socialre = SOCIAL_REGEX
  }

  // Smart preset: Account alerts — security / sign-in notices from providers.
  if (f.preset === 'accounts') {
    conds.push(
      `(from_email LIKE '%accounts.google.com%'
        OR from_email LIKE '%@google.com%'
        OR from_email LIKE '%@accounts.%'
        OR from_email LIKE '%microsoft%'
        OR from_email LIKE '%@apple.com%'
        OR from_email LIKE '%appleid%'
        OR IFNULL(from_name,'') REGEXP @acctname
        OR subject REGEXP @acctsub
        OR snippet REGEXP @acctsub)`
    )
    params.acctname = ACCOUNT_NAME_REGEX
    params.acctsub = ACCOUNT_SUBJECT_REGEX
  }

  // Smart preset: News — newsletters / publishers.
  if (f.preset === 'news') {
    conds.push(
      `(IFNULL(from_name,'') REGEXP @newsre
        OR IFNULL(from_email,'') REGEXP @newsre)`
    )
    params.newsre = NEWS_REGEX
  }

  // Smart preset: Important — mail from VIP senders (split inbox).
  if (f.preset === 'important') {
    const vips = (f.vip ?? []).filter(Boolean)
    if (vips.length === 0) {
      conds.push('0') // no VIPs -> empty result
    } else {
      const ors = vips.map((_, i) => `from_email LIKE @vip${i}`)
      vips.forEach((v, i) => {
        params[`vip${i}`] = `%${v}%`
      })
      conds.push(`(${ors.join(' OR ')})`)
    }
  }
  if (f.search && f.search.trim()) {
    const s = f.search.trim()
    const fromMatch = s.match(/^from:\s*(.+)$/i)
    if (fromMatch) {
      // Search by sender: from:someone@example.com or from:Jane
      conds.push('(from_email LIKE @fromq OR from_name LIKE @fromq)')
      params.fromq = `%${fromMatch[1].trim()}%`
    } else {
      const fts = toFtsQuery(s)
      if (fts) {
        // FTS5 full-text match across subject/snippet/body/sender.
        conds.push(
          'id IN (SELECT msg_id FROM messages_fts WHERE messages_fts MATCH @fts)'
        )
        params.fts = fts
      }
    }
  }

  // Attachment browser: only messages that carry attachments, optionally of a
  // given kind (matched against the stored attachment JSON: mime + filename).
  if (f.attachmentsOnly || (f.attachmentKind && f.attachmentKind !== 'any')) {
    conds.push('has_attachments = 1')
    const kindClauses: Record<string, string> = {
      pdf: `(attachments_json LIKE '%application/pdf%' OR attachments_json LIKE '%.pdf%')`,
      image: `(attachments_json LIKE '%image/%' OR attachments_json LIKE '%.png%' OR attachments_json LIKE '%.jpg%' OR attachments_json LIKE '%.jpeg%' OR attachments_json LIKE '%.gif%' OR attachments_json LIKE '%.heic%' OR attachments_json LIKE '%.webp%')`,
      doc: `(attachments_json LIKE '%msword%' OR attachments_json LIKE '%wordprocessing%' OR attachments_json LIKE '%.doc%' OR attachments_json LIKE '%.docx%' OR attachments_json LIKE '%.txt%' OR attachments_json LIKE '%.rtf%')`,
      sheet: `(attachments_json LIKE '%spreadsheet%' OR attachments_json LIKE '%ms-excel%' OR attachments_json LIKE '%.xls%' OR attachments_json LIKE '%.xlsx%' OR attachments_json LIKE '%.csv%')`,
      archive: `(attachments_json LIKE '%zip%' OR attachments_json LIKE '%.zip%' OR attachments_json LIKE '%.rar%' OR attachments_json LIKE '%7z%' OR attachments_json LIKE '%.tar%')`
    }
    const kc = f.attachmentKind ? kindClauses[f.attachmentKind] : undefined
    if (kc) conds.push(kc)
  }

  return {
    clause: conds.length ? `WHERE ${conds.join(' AND ')}` : '',
    params
  }
}

export function listMessages(filters: MessageFilters = {}): Message[] {
  const db = getDb()
  const { clause, params } = buildWhere(filters)
  const limit = filters.limit ?? 200
  const offset = filters.offset ?? 0
  const rows = db
    .prepare(
      `SELECT * FROM messages ${clause}
       ORDER BY received_at DESC LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, limit, offset }) as MessageRow[]
  return rows.map(rowToMessage)
}

// Thread list: one row per unified thread, honoring the same filters by joining
// against messages so folder/account/search still apply.
export function listThreads(filters: MessageFilters = {}): ThreadSummary[] {
  const db = getDb()
  const { clause, params } = buildWhere(filters)
  const limit = filters.limit ?? 200
  const offset = filters.offset ?? 0
  const now = Date.now()
  // Hide snoozed threads from normal views; show only them in the Snoozed view.
  const snoozeClause = filters.snoozedOnly
    ? 'AND t.snoozed_until > @now'
    : 'AND t.snoozed_until <= @now'
  const followClause = filters.followUpOnly ? 'AND t.follow_up_due = 1' : ''

  const rows = db
    .prepare(
      `SELECT t.* FROM threads t
       WHERE t.id IN (
         SELECT DISTINCT unified_thread_id FROM messages ${clause}
       ) ${snoozeClause} ${followClause}
       ORDER BY t.last_message_at DESC LIMIT @limit OFFSET @offset`
    )
    .all({ ...params, now, limit, offset }) as Array<{
    id: string
    subject: string
    snippet: string
    last_message_at: number
    last_message_id: string
    message_count: number
    unread_count: number
    has_starred: number
    participants_json: string
    account_ids_json: string
    providers_json: string
    follow_up_at: number
    follow_up_due: number
  }>

  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    snippet: r.snippet,
    lastMessageAt: r.last_message_at,
    lastMessageId: r.last_message_id,
    messageCount: r.message_count,
    unreadCount: r.unread_count,
    hasStarred: r.has_starred === 1,
    participants: JSON.parse(r.participants_json) as Address[],
    accountIds: JSON.parse(r.account_ids_json) as string[],
    providers: JSON.parse(r.providers_json) as Provider[],
    followUpAt: r.follow_up_at || undefined,
    followUpDue: r.follow_up_due === 1
  }))
}

export function getThread(unifiedThreadId: string): ThreadDetail | null {
  const db = getDb()
  const summary = listThreads({}).find((t) => t.id === unifiedThreadId)
  const tRow = db
    .prepare(`SELECT * FROM threads WHERE id = ?`)
    .get(unifiedThreadId) as
    | {
        id: string
        subject: string
        snippet: string
        last_message_at: number
        last_message_id: string
        message_count: number
        unread_count: number
        has_starred: number
        participants_json: string
        account_ids_json: string
        providers_json: string
      }
    | undefined
  if (!tRow) return null

  const messages = (
    db
      .prepare(
        `SELECT * FROM messages WHERE unified_thread_id = ? ORDER BY received_at ASC`
      )
      .all(unifiedThreadId) as MessageRow[]
  ).map(rowToMessage)

  void summary
  return {
    id: tRow.id,
    subject: tRow.subject,
    snippet: tRow.snippet,
    lastMessageAt: tRow.last_message_at,
    lastMessageId: tRow.last_message_id,
    messageCount: tRow.message_count,
    unreadCount: tRow.unread_count,
    hasStarred: tRow.has_starred === 1,
    participants: JSON.parse(tRow.participants_json) as Address[],
    accountIds: JSON.parse(tRow.account_ids_json) as string[],
    providers: JSON.parse(tRow.providers_json) as Provider[],
    messages
  }
}

// Look up provider + provider_message_id for a synthetic message id, so IPC
// action handlers can call the right adapter.
export function getMessageRoute(
  messageId: string
): { accountId: string; provider: Provider; providerMessageId: string } | null {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT account_id, provider, provider_message_id FROM messages WHERE id = ?`
    )
    .get(messageId) as
    | { account_id: string; provider: Provider; provider_message_id: string }
    | undefined
  if (!row) return null
  return {
    accountId: row.account_id,
    provider: row.provider,
    providerMessageId: row.provider_message_id
  }
}

// Mark every message in the given threads read (local). Returns provider
// message routes for the messages that were unread, so callers can propagate.
export function markThreadsReadLocal(
  threadIds: string[]
): Array<{ accountId: string; provider: Provider; providerMessageId: string }> {
  if (threadIds.length === 0) return []
  const db = getDb()
  const placeholders = threadIds.map(() => '?').join(',')
  const unread = db
    .prepare(
      `SELECT account_id, provider, provider_message_id FROM messages
       WHERE unified_thread_id IN (${placeholders}) AND is_read = 0`
    )
    .all(...threadIds) as Array<{
    account_id: string
    provider: Provider
    provider_message_id: string
  }>
  db.prepare(
    `UPDATE messages SET is_read = 1 WHERE unified_thread_id IN (${placeholders})`
  ).run(...threadIds)
  for (const id of threadIds) recomputeThread(db, id)
  return unread.map((r) => ({
    accountId: r.account_id,
    provider: r.provider,
    providerMessageId: r.provider_message_id
  }))
}

// Contact autocomplete: distinct senders (name + email) matching a query.
export function searchContacts(
  query: string,
  limit = 8
): Array<{ name: string | null; email: string }> {
  const q = query.trim()
  if (!q) return []
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT from_name AS name, from_email AS email, MAX(received_at) AS last
         FROM messages
        WHERE from_email IS NOT NULL
          AND (from_email LIKE @q OR from_name LIKE @q)
        GROUP BY LOWER(from_email)
        ORDER BY last DESC
        LIMIT @limit`
    )
    .all({ q: `%${q}%`, limit }) as Array<{
    name: string | null
    email: string
    last: number
  }>
  return rows.map((r) => ({ name: r.name, email: r.email }))
}

// Snooze a thread until `until` (epoch ms). until=0 clears the snooze.
export function snoozeThread(threadId: string, until: number): void {
  const db = getDb()
  db.prepare(`UPDATE threads SET snoozed_until = ? WHERE id = ?`).run(
    until,
    threadId
  )
}

// The soonest future snooze expiry, for scheduling a re-surface refresh.
export function nextSnoozeExpiry(): number | null {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT MIN(snoozed_until) AS next FROM threads WHERE snoozed_until > ?`
    )
    .get(Date.now()) as { next: number | null }
  return row.next ?? null
}

// --- AI digest -------------------------------------------------------------

// Inbox messages for a digest range: today / last 7d / last 30d / unread.
export function messagesForDigest(
  range: 'today' | 'week' | 'month' | 'unread'
): Message[] {
  const db = getDb()
  let where = `folder = 'inbox' AND archived = 0`
  const params: Record<string, unknown> = {}
  if (range === 'unread') {
    where += ` AND is_read = 0`
  } else {
    const now = new Date()
    let since: number
    if (range === 'today') {
      const start = new Date(now)
      start.setHours(0, 0, 0, 0)
      since = start.getTime()
    } else if (range === 'week') {
      since = now.getTime() - 7 * 86400_000
    } else {
      since = now.getTime() - 30 * 86400_000
    }
    where += ` AND received_at >= @since`
    params.since = since
  }
  const rows = db
    .prepare(
      `SELECT * FROM messages WHERE ${where}
       ORDER BY received_at DESC LIMIT 200`
    )
    .all(params) as MessageRow[]
  return rows.map(rowToMessage)
}

// --- Bulk unsubscribe ------------------------------------------------------

// Parse a raw List-Unsubscribe header into its http and mailto targets.
export function parseUnsubscribe(raw: string | null): {
  url: string | null
  mailto: string | null
} {
  if (!raw) return { url: null, mailto: null }
  const url = raw.match(/<\s*(https?:\/\/[^>]+)\s*>/i)?.[1] ?? null
  const mailto = raw.match(/<\s*mailto:([^>]+)\s*>/i)?.[1] ?? null
  return { url, mailto: mailto ? `mailto:${mailto}` : null }
}

interface BulkSenderRow {
  from_email: string
  from_name: string | null
  n: number
  unsubscribe: string | null
  sample_id: string
}

// Aggregate current inbox bulk senders (newsletters/marketing) with counts and
// an unsubscribe target, most-frequent first.
export function listBulkSenders(): import('@shared/types').BulkSender[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT from_email,
              MAX(from_name) AS from_name,
              COUNT(*) AS n,
              MAX(unsubscribe) AS unsubscribe,
              MAX(id) AS sample_id
         FROM messages
        WHERE bulk = 1 AND archived = 0 AND folder = 'inbox'
          AND from_email IS NOT NULL AND TRIM(from_email) <> ''
        GROUP BY LOWER(from_email)
        ORDER BY n DESC, from_email ASC`
    )
    .all() as BulkSenderRow[]
  return rows.map((r) => {
    const { url, mailto } = parseUnsubscribe(r.unsubscribe)
    return {
      fromEmail: r.from_email,
      fromName: r.from_name,
      count: r.n,
      unsubscribeUrl: url,
      unsubscribeMailto: mailto,
      sampleMessageId: r.sample_id
    }
  })
}

// Inbox messages from a given sender (for archive-all after unsubscribing).
export function inboxMessagesFromSender(email: string): Array<{
  id: string
  accountId: string
  provider: Provider
  providerMessageId: string
}> {
  const db = getDb()
  return db
    .prepare(
      `SELECT id, account_id AS accountId, provider,
              provider_message_id AS providerMessageId
         FROM messages
        WHERE LOWER(from_email) = LOWER(?) AND archived = 0 AND folder = 'inbox'`
    )
    .all(email) as Array<{
    id: string
    accountId: string
    provider: Provider
    providerMessageId: string
  }>
}

// --- Remind me if no reply -------------------------------------------------

// Set (or clear, with at=0) a follow-up reminder on a thread. Baseline is the
// thread's current newest message, so any later inbound message counts as a
// reply that cancels the reminder.
export function setFollowUp(threadId: string, at: number): void {
  const db = getDb()
  if (at <= 0) {
    db.prepare(
      `UPDATE threads SET follow_up_at = 0, follow_up_base = 0, follow_up_due = 0
       WHERE id = ?`
    ).run(threadId)
    return
  }
  const t = db
    .prepare(`SELECT last_message_at AS b FROM threads WHERE id = ?`)
    .get(threadId) as { b: number } | undefined
  db.prepare(
    `UPDATE threads SET follow_up_at = @at, follow_up_base = @base,
        follow_up_due = 0 WHERE id = @id`
  ).run({ id: threadId, at, base: t?.b ?? Date.now() })
}

export function clearFollowUp(threadId: string): void {
  setFollowUp(threadId, 0)
}

// Process reminders that are due. For each: if an inbound reply arrived after
// the baseline, clear it silently; otherwise mark it due (surfaces in
// Follow-ups). Returns the thread subjects that newly became due (for notify).
export function processDueFollowUps(now = Date.now()): string[] {
  const db = getDb()
  const due = db
    .prepare(
      `SELECT id, subject, follow_up_base AS base FROM threads
        WHERE follow_up_at > 0 AND follow_up_at <= ?`
    )
    .all(now) as Array<{ id: string; subject: string; base: number }>
  const surfaced: string[] = []
  for (const t of due) {
    const reply = db
      .prepare(
        `SELECT COUNT(*) AS n FROM messages
          WHERE unified_thread_id = @id AND folder = 'inbox'
            AND received_at > @base`
      )
      .get({ id: t.id, base: t.base }) as { n: number }
    if (reply.n > 0) {
      db.prepare(
        `UPDATE threads SET follow_up_at = 0, follow_up_base = 0,
            follow_up_due = 0 WHERE id = ?`
      ).run(t.id)
    } else {
      db.prepare(
        `UPDATE threads SET follow_up_at = 0, follow_up_due = 1 WHERE id = ?`
      ).run(t.id)
      surfaced.push(t.subject || '(no subject)')
    }
  }
  return surfaced
}

// Soonest pending follow-up check time, for scheduling.
export function nextFollowUpTime(): number | null {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT MIN(follow_up_at) AS next FROM threads WHERE follow_up_at > ?`
    )
    .get(Date.now()) as { next: number | null }
  return row.next ?? null
}

// One-time cleanup: remove empty placeholder messages (no sender, subject, or
// snippet) that some providers return, then rebuild the affected threads.
export function pruneEmptyMessages(): number {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT id, unified_thread_id AS t FROM messages
        WHERE (from_email IS NULL OR TRIM(from_email) = '')
          AND TRIM(subject) = '' AND TRIM(snippet) = ''`
    )
    .all() as Array<{ id: string; t: string }>
  if (rows.length === 0) return 0
  const affected = new Set(rows.map((r) => r.t))
  const del = db.prepare(`DELETE FROM messages WHERE id = ?`)
  const delFts = db.prepare(`DELETE FROM messages_fts WHERE msg_id = ?`)
  const tx = db.transaction(() => {
    for (const r of rows) {
      del.run(r.id)
      delFts.run(r.id)
    }
  })
  tx()
  for (const t of affected) recomputeThread(db, t)
  return rows.length
}

// Count of unread inbox messages (for the tray badge).
export function countUnreadInbox(): number {
  const db = getDb()
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM messages WHERE is_read = 0 AND folder = 'inbox'`
    )
    .get() as { n: number }
  return row.n
}

// Most recent unread inbox messages (for the tray quick-glance menu).
export function recentUnread(limit = 5): Message[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT * FROM messages WHERE is_read = 0 AND folder = 'inbox'
       ORDER BY received_at DESC LIMIT ?`
    )
    .all(limit) as MessageRow[]
  return rows.map(rowToMessage)
}

// Given a set of synthetic message ids, return those not already stored — used
// to decide which messages are genuinely new (for notifications).
export function filterNewMessageIds(ids: string[]): Set<string> {
  const db = getDb()
  const existing = new Set<string>()
  const stmt = db.prepare(`SELECT 1 FROM messages WHERE id = ?`)
  for (const id of ids) {
    if (stmt.get(id)) existing.add(id)
  }
  return new Set(ids.filter((id) => !existing.has(id)))
}

// Full message needed to build a reply/forward (recipients, threading, subject).
export function getMessageById(messageId: string): Message | null {
  const db = getDb()
  const row = db
    .prepare(`SELECT * FROM messages WHERE id = ?`)
    .get(messageId) as MessageRow | undefined
  return row ? rowToMessage(row) : null
}
