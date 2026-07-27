import type { Address } from '@shared/types'

// Render an address list as a comma-separated header string.
export function addressLine(list: Address[]): string {
  return list.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)).join(', ')
}
