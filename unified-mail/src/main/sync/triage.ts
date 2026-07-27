// Auto-triage: apply user-defined rules to freshly-arrived mail.
//
// Rules live in settings (AppSettings.rules). Each rule matches on sender,
// subject, or a smart category, and applies one action. We run this from the
// sync engine on non-full syncs, over just the newly-inserted messages, so it
// never re-processes the whole mailbox.

import type { MailRule, Provider, RuleCategory } from '@shared/types'
import type { NormalizedMessage } from './types'
import { getSettings } from '../settings/settingsStore'
import { getValidAccessToken } from '../auth/session'
import { gmailAdapter } from './gmail'
import { outlookAdapter } from './outlook'
import type { AdapterContext, ProviderAdapter } from './types'
import { matchesCategory } from './classify'
import { setReadLocal, setStarredLocal, archiveThread, removeMessageLocal } from './store'

function adapterFor(provider: Provider): ProviderAdapter {
  return provider === 'google' ? gmailAdapter : outlookAdapter
}
function ctxFor(accountId: string): AdapterContext {
  return { accountId, getAccessToken: () => getValidAccessToken(accountId) }
}

function ruleMatches(rule: MailRule, m: NormalizedMessage): boolean {
  const v = rule.value.trim().toLowerCase()
  if (!v) return false
  if (rule.field === 'from') {
    return (
      (m.from?.email ?? '').toLowerCase().includes(v) ||
      (m.from?.name ?? '').toLowerCase().includes(v)
    )
  }
  if (rule.field === 'subject') {
    return m.subject.toLowerCase().includes(v)
  }
  // category
  return matchesCategory(m, rule.value as RuleCategory)
}

// Apply the first matching rule per message. Returns number of messages acted on.
export function applyRulesToNewMail(messages: NormalizedMessage[]): number {
  const rules = getSettings().rules.filter((r) => r.enabled)
  if (rules.length === 0 || messages.length === 0) return 0

  let acted = 0
  for (const m of messages) {
    // Only triage inbox mail.
    if (m.folder !== 'inbox') continue
    const rule = rules.find((r) => ruleMatches(r, m))
    if (!rule) continue
    acted++
    const id = `${m.accountId}::${m.providerMessageId}`
    const ctx = ctxFor(m.accountId)
    const adapter = adapterFor(m.provider)

    switch (rule.action) {
      case 'skipInbox':
        archiveThread(id, true)
        setReadLocal(id, true)
        void adapter.setRead(ctx, m.providerMessageId, true).catch(() => {})
        void adapter.archive(ctx, m.providerMessageId).catch(() => {})
        break
      case 'markRead':
        setReadLocal(id, true)
        void adapter.setRead(ctx, m.providerMessageId, true).catch(() => {})
        break
      case 'star':
        setStarredLocal(id, true)
        void adapter.setStarred(ctx, m.providerMessageId, true).catch(() => {})
        break
      case 'trash':
        removeMessageLocal(id)
        void adapter.trash(ctx, m.providerMessageId).catch(() => {})
        break
    }
  }
  return acted
}
