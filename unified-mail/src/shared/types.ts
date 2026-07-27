// Shared types used across the main, preload, and renderer processes.

export type Provider = 'google' | 'microsoft'

export interface ConnectedAccount {
  id: string
  provider: Provider
  email: string
  displayName: string | null
  connectedAt: number
  // Never contains tokens. Tokens live encrypted in the main process only.
}

export interface ConnectResult {
  ok: boolean
  account?: ConnectedAccount
  error?: string
}

// The typed surface the renderer is allowed to call, exposed via preload.
export interface AuthApi {
  connect: (provider: Provider) => Promise<ConnectResult>
  disconnect: (accountId: string) => Promise<{ ok: boolean; error?: string }>
  listAccounts: () => Promise<ConnectedAccount[]>
}

// ---------------------------------------------------------------------------
// Mail (Prompt 2)
// ---------------------------------------------------------------------------

export interface Address {
  name: string | null
  email: string
}

export interface Attachment {
  id: string // provider attachment id
  filename: string
  mimeType: string
  size: number // bytes
}

// A message normalized from either provider into one shape.
export interface Message {
  id: string // synthetic: `${accountId}::${providerMessageId}`
  accountId: string
  provider: Provider
  providerMessageId: string
  providerThreadId: string
  unifiedThreadId: string
  from: Address | null
  to: Address[]
  cc: Address[]
  subject: string
  snippet: string
  bodyHtml: string | null
  bodyText: string | null
  receivedAt: number // epoch ms
  isRead: boolean
  isStarred: boolean
  folder: string
  labels: string[]
  hasAttachments: boolean
  attachments: Attachment[]
  bulk: boolean // newsletter/marketing (List-Unsubscribe or bulk category)
  unsubscribe: string | null // raw List-Unsubscribe header value, if present
}

// A unified thread that may span multiple accounts/providers.
export interface ThreadSummary {
  id: string
  subject: string
  snippet: string
  lastMessageAt: number
  lastMessageId: string // representative message (newest) for quick actions
  messageCount: number
  unreadCount: number
  hasStarred: boolean
  participants: Address[]
  accountIds: string[]
  providers: Provider[]
  // Remind-me-if-no-reply: when set and due with no inbound reply, the thread
  // surfaces in the Follow-ups view.
  followUpAt?: number // epoch ms to check (0/undefined = none)
  followUpDue?: boolean // reminder fired and is awaiting attention
}

// --- Auto-triage rules ---------------------------------------------------
export type RuleField = 'from' | 'subject' | 'category'
export type RuleCategory =
  | 'promotions'
  | 'social'
  | 'news'
  | 'accounts'
  | 'bulk'
export type RuleAction = 'skipInbox' | 'markRead' | 'star' | 'trash'

export interface MailRule {
  id: string
  name: string
  enabled: boolean
  field: RuleField
  value: string // substring (from/subject) or a RuleCategory name
  action: RuleAction
}

// --- Signatures ----------------------------------------------------------
export interface Signature {
  id: string
  name: string
  html: string
  accountId: string | null // null = available to all accounts
  isDefault: boolean // auto-insert on new/reply compose
}

// --- Bulk unsubscribe ----------------------------------------------------
export interface BulkSender {
  fromEmail: string
  fromName: string | null
  count: number
  unsubscribeUrl: string | null // http(s) one-click link if available
  unsubscribeMailto: string | null // mailto: unsubscribe if available
  sampleMessageId: string
}

export interface ThreadDetail extends ThreadSummary {
  messages: Message[]
}

export interface MessageFilters {
  accountId?: string // limit to one account
  provider?: Provider
  folder?: string // e.g. 'inbox'
  unreadOnly?: boolean
  starredOnly?: boolean
  snoozedOnly?: boolean // show only currently-snoozed threads
  followUpOnly?: boolean // show only threads whose follow-up reminder is due
  // Smart presets: promotions (ads), dated, important (VIP), people (humans),
  // social (social-media updates), accounts (account/security alerts),
  // news (news publishers).
  preset?:
    | 'promotions'
    | 'dated'
    | 'important'
    | 'people'
    | 'social'
    | 'accounts'
    | 'news'
  vip?: string[] // VIP sender emails, used with preset='important'
  search?: string // full-text match (FTS5)
  // Attachment browser: restrict to messages that have attachments, optionally
  // of a given kind.
  attachmentsOnly?: boolean
  attachmentKind?: 'any' | 'pdf' | 'image' | 'doc' | 'sheet' | 'archive'
  limit?: number
  offset?: number
}

export interface SyncStatus {
  accountId: string
  lastSyncAt: number | null
  lastFullSyncAt: number | null
  syncing: boolean
  error: string | null
}

export interface ActionResult {
  ok: boolean
  error?: string
}

export interface DownloadResult extends ActionResult {
  path?: string
}

export interface MailApi {
  listThreads: (filters?: MessageFilters) => Promise<ThreadSummary[]>
  listMessages: (filters?: MessageFilters) => Promise<Message[]>
  getThread: (unifiedThreadId: string) => Promise<ThreadDetail | null>
  markRead: (messageId: string, read: boolean) => Promise<ActionResult>
  markThreadsRead: (threadIds: string[]) => Promise<ActionResult>
  star: (messageId: string, starred: boolean) => Promise<ActionResult>
  archive: (messageId: string) => Promise<ActionResult>
  trash: (messageId: string) => Promise<ActionResult>
  // Lazily fetch attachment metadata for a message (used for Outlook, whose
  // attachment list isn't included in the sync payload).
  getAttachments: (messageId: string) => Promise<Attachment[]>
  // Download an attachment to the OS Downloads folder; returns the saved path.
  downloadAttachment: (
    messageId: string,
    attachmentId: string
  ) => Promise<DownloadResult>
  // Snooze a thread until `until` (epoch ms); it hides from inbox and
  // re-surfaces when the time passes. Pass until=0 to unsnooze.
  snooze: (threadId: string, until: number) => Promise<ActionResult>
  // Remind me if no reply: check the thread at `at`; if no inbound reply has
  // arrived by then, it surfaces in Follow-ups. Pass at=0 to clear.
  remindNoReply: (threadId: string, at: number) => Promise<ActionResult>
  clearFollowUp: (threadId: string) => Promise<ActionResult>
  // Bulk unsubscribe manager.
  listBulkSenders: () => Promise<BulkSender[]>
  unsubscribeSender: (
    fromEmail: string
  ) => Promise<{ ok: boolean; opened?: boolean; archived: number; error?: string }>
  sync: (accountId?: string) => Promise<ActionResult>
  getSyncStatus: () => Promise<SyncStatus[]>
  searchContacts: (query: string) => Promise<Address[]>
}

export interface Snippet {
  id: string
  name: string
  keyword: string // slash-command trigger
  bodyHtml: string
  updatedAt: number
}

export interface SnippetsApi {
  list: () => Promise<Snippet[]>
  save: (snippet: Snippet) => Promise<ActionResult>
  remove: (id: string) => Promise<ActionResult>
}

// ---------------------------------------------------------------------------
// Compose / drafts / outbox (Prompt 4)
// ---------------------------------------------------------------------------

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward'

// An attachment staged in a draft. We keep the local file path and read bytes
// only at send time, so large files don't travel through IPC while editing.
export interface DraftAttachment {
  name: string
  path: string
  size: number
  mimeType: string
}

export interface Draft {
  id: string
  accountId: string
  to: string // comma-separated addresses (raw, as typed)
  cc: string
  bcc: string
  subject: string
  bodyHtml: string
  mode: ComposeMode
  // The message being replied to / forwarded (our synthetic id), if any.
  inReplyToMessageId: string | null
  attachments: DraftAttachment[]
  updatedAt: number
}

export type OutboxStatus = 'pending' | 'sending' | 'sent' | 'failed'

export interface OutboxItem {
  id: string
  draftId: string
  accountId: string
  subject: string
  status: OutboxStatus
  attempts: number
  error: string | null
  // When set (future), the item is scheduled to send after this time — used by
  // undo-send. Until then it can be cancelled.
  sendAfter: number
  updatedAt: number
}

export interface ComposeApi {
  // Native file dialog; returns staged attachments (path + metadata).
  pickFiles: () => Promise<DraftAttachment[]>
  saveDraft: (draft: Draft) => Promise<ActionResult>
  listDrafts: () => Promise<Draft[]>
  getDraft: (id: string) => Promise<Draft | null>
  deleteDraft: (id: string) => Promise<ActionResult>
  // Build a prefilled reply/reply-all/forward draft from an existing message.
  buildReply: (messageId: string, mode: ComposeMode) => Promise<Draft>
  // Enqueue a draft for sending (with an undo delay). Pass sendAt (epoch ms)
  // to schedule a "send later". Returns the outbox id.
  send: (
    draft: Draft,
    sendAt?: number
  ) => Promise<{ ok: boolean; outboxId?: string; error?: string }>
  // Cancel a queued send during its undo window.
  cancelSend: (outboxId: string) => Promise<ActionResult>
  getOutbox: () => Promise<OutboxItem[]>
}

// ---------------------------------------------------------------------------
// Settings (Prompt 6)
// ---------------------------------------------------------------------------

export type Theme = 'dark' | 'light' | 'system'

export type Phosphor = 'mono' | 'green' | 'amber' | 'ice' | 'red'

export interface CrtEffects {
  scanlines: boolean
  glow: boolean
  flicker: boolean
  grain: boolean
  sweep: boolean // CRT refresh sweep bar
  glitch: boolean // glitch jitter
  chromatic: boolean // chromatic aberration
  pulse: boolean // phosphor pulse (breathe)
  rain: boolean
  snow: boolean
  petals: boolean // drifting petals
  embers: boolean // rising embers
}

export interface AppSettings {
  theme: Theme
  notifications: boolean
  doNotDisturb: boolean
  syncSeconds: number // background sync frequency
  autoLaunch: boolean
  signatures: Record<string, string> // accountId -> signature HTML
  phosphor: Phosphor
  effects: CrtEffects
  font: string // font family key (see FONT_STACKS in App)
  fontScale: number // percent, e.g. 100
  linkIconStyle: 'favicon' | 'letter' | 'minimal'
  broker: 'none' | 'webull' | 'robinhood' | 'fidelity' | 'schwab'
  autoLoadImages: boolean // load remote email images automatically
  savedSearches: SavedSearch[]
  vipSenders: string[] // emails treated as VIP (split-inbox Important)
  startView: 'dashboard' | 'mail'
  ambientAutostart: boolean
  ambientTrack: string // media:// url of the startup ambient sound
  ambientGif: string // media:// url of the startup screensaver gif
  ambientVolume: number
  musicAutostart: boolean
  musicTrack: string // media:// url of the startup song
  musicVolume: number
  undoSendSeconds: number // grace window before mail actually leaves (0 = off)
  aiProvider: 'none' | 'anthropic' | 'openai' | 'azure'
  aiApiKey: string // stored locally; used for summarize / draft reply
  aiModel: string // optional model override; for azure this is the deployment
  aiBaseUrl: string // azure/custom endpoint base, e.g. https://x.openai.azure.com
  rules: MailRule[] // auto-triage rules applied to incoming mail
  signatureList: Signature[] // named signatures (multi per account)
}

// Result of an AI request (summary or drafted reply).
export interface AiResult {
  ok: boolean
  text?: string
  error?: string
}

export interface SavedSearch {
  id: string
  name: string
  search: string
  preset?:
    | 'promotions'
    | 'dated'
    | 'important'
    | 'people'
    | 'social'
    | 'accounts'
    | 'news'
}

export interface SettingsApi {
  get: () => Promise<AppSettings>
  set: (partial: Partial<AppSettings>) => Promise<AppSettings>
}


export interface ClipboardApi {
  read: () => Promise<string>
  write: (text: string) => Promise<boolean>
}

export type DigestRange = 'today' | 'week' | 'month' | 'unread'

export interface AiApi {
  summarize: (threadId: string) => Promise<AiResult>
  // messageId = the message being replied to (its thread supplies context).
  draftReply: (messageId: string, instructions: string) => Promise<AiResult>
  // Summarize inbox mail over a time range (or unread).
  digest: (range: DigestRange) => Promise<AiResult>
}

export interface ExposedApi {
  auth: AuthApi
  mail: MailApi
  compose: ComposeApi
  ai: AiApi
  snippets: SnippetsApi
  settings: SettingsApi
  clipboard: ClipboardApi
}
