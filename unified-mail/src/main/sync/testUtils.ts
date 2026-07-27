// Test helpers: a tiny fetch mock that routes by URL and returns Response-like
// objects compatible with the subset of the Fetch API that http.ts uses.

export interface MockRoute {
  match: (url: string, init?: RequestInit) => boolean
  status?: number
  json?: unknown
  headers?: Record<string, string>
}

export function makeFetch(routes: MockRoute[]): {
  fetchImpl: typeof fetch
  calls: string[]
} {
  const calls: string[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    calls.push(url)
    const route = routes.find((r) => r.match(url, init))
    if (!route) {
      throw new Error(`No mock route for ${url}`)
    }
    const status = route.status ?? 200
    const body = route.json === undefined ? '' : JSON.stringify(route.json)
    const headers = new Map(
      Object.entries(route.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])
    )
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (h: string) => headers.get(h.toLowerCase()) ?? null },
      text: async () => body,
      json: async () => JSON.parse(body)
    } as unknown as Response
  }) as typeof fetch
  return { fetchImpl, calls }
}

export const token = async (): Promise<string> => 'test-token'
