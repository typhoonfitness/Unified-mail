import type { AppSettings } from '../../../shared/types'

type Broker = AppSettings['broker']

// A quote/trade page URL for a symbol at the chosen broker (empty = no link).
export function brokerUrl(broker: Broker, symbol: string): string {
  const s = symbol.toUpperCase().replace('-USD', '')
  switch (broker) {
    case 'webull':
      return `https://www.webull.com/quote/${s.toLowerCase()}`
    case 'robinhood':
      return `https://robinhood.com/stocks/${s}`
    case 'fidelity':
      return `https://digital.fidelity.com/prgw/digital/research/quote/dashboard/summary?symbol=${s}`
    case 'schwab':
      return `https://www.schwab.com/research/stocks/quotes/summary/${s}`
    default:
      return ''
  }
}
