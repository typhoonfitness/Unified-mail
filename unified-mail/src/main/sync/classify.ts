// Per-message category predicates, mirroring the smart-filter SQL in store.ts.
// Used by the auto-triage engine to evaluate category-based rules on incoming
// mail without going back through SQLite.

import type { RuleCategory } from '@shared/types'
import type { NormalizedMessage } from './types'

const SOCIAL =
  /\b(facebook|facebookmail|instagram|threads|meta|reddit|redditmail|substack|tiktok|linkedin|twitter|discord|pinterest|snapchat|tumblr|mastodon|bluesky|youtube|twitch|quora|nextdoor|whatsapp|telegram|patreon|onlyfans|goodreads)\b/i

const NEWS =
  /\b(new york times|nytimes|nyt|washington post|washingtonpost|wapo|associated press|ap news|apnews|reuters|bloomberg|the guardian|guardian|bbc|cnn|npr|wall street journal|wsj|the economist|economist|politico|axios|the atlantic|the verge|techcrunch|financial times|forbes|business insider|usa today|los angeles times|latimes|the hill|vox|cnbc|fox news|msnbc|the daily|morning brew|semafor|substack|newsletter|the athletic|propublica)\b/i

const ACCOUNT_NAME =
  /\b(microsoft|google|apple|okta|duo|dropbox|github|slack|zoom|amazon|paypal|authenticator|account team|security team)\b/i
const ACCOUNT_SUBJECT =
  /\b(security alert|sign-?in|signed in|verification code|verify your|password|two-?factor|2fa|one-?time|otp|suspicious|new device|new sign-?in|account activity|log ?in|was blocked|recovery|authenticator|confirm your email|unusual activity|reset your)\b/i

function nameEmail(m: NormalizedMessage): string {
  return `${m.from?.name ?? ''} ${m.from?.email ?? ''}`
}

export function matchesCategory(
  m: NormalizedMessage,
  category: RuleCategory
): boolean {
  const labels = m.labels ?? []
  switch (category) {
    case 'bulk':
      return m.bulk
    case 'promotions':
      return m.bulk || labels.includes('CATEGORY_PROMOTIONS')
    case 'social':
      return labels.includes('CATEGORY_SOCIAL') || SOCIAL.test(nameEmail(m))
    case 'news':
      return NEWS.test(nameEmail(m))
    case 'accounts': {
      const email = (m.from?.email ?? '').toLowerCase()
      return (
        email.includes('accounts.google.com') ||
        email.includes('@google.com') ||
        email.includes('@accounts.') ||
        email.includes('microsoft') ||
        email.includes('@apple.com') ||
        email.includes('appleid') ||
        ACCOUNT_NAME.test(m.from?.name ?? '') ||
        ACCOUNT_SUBJECT.test(m.subject) ||
        ACCOUNT_SUBJECT.test(m.snippet)
      )
    }
    default:
      return false
  }
}
