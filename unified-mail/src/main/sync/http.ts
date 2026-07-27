// Authorized HTTP helper shared by both provider adapters.
//
// Responsibilities:
//   - attach the Bearer token
//   - parse JSON
//   - retry on transient failures (429 / 500 / 502 / 503 / 504) with
//     exponential backoff + jitter, honoring Retry-After when present
//   - surface 401 distinctly so the caller can force a token refresh
//
// `fetch` is a Node/Electron global (Node 18+), so no dependency is needed.

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export class UnauthorizedError extends HttpError {
  constructor(body: string) {
    super('Unauthorized (401)', 401, body)
    this.name = 'UnauthorizedError'
  }
}

const RETRYABLE = new Set([429, 500, 502, 503, 504])
const MAX_RETRIES = 5
const BASE_DELAY_MS = 500

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function backoffDelay(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const secs = Number(retryAfterHeader)
    if (!Number.isNaN(secs)) return secs * 1000
    const date = Date.parse(retryAfterHeader)
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now())
  }
  // Exponential backoff with full jitter.
  const ceiling = BASE_DELAY_MS * 2 ** attempt
  return Math.floor(Math.random() * ceiling)
}

export interface RequestOptions {
  method?: string
  accessToken: string
  headers?: Record<string, string>
  body?: string
  // Injectable for tests; defaults to the global fetch.
  fetchImpl?: typeof fetch
}

export async function requestJson<T>(
  url: string,
  opts: RequestOptions
): Promise<T> {
  const doFetch = opts.fetchImpl ?? fetch
  let lastErr: unknown

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res: Response
    try {
      res = await doFetch(url, {
        method: opts.method ?? 'GET',
        headers: {
          authorization: `Bearer ${opts.accessToken}`,
          ...(opts.body ? { 'content-type': 'application/json' } : {}),
          ...opts.headers
        },
        body: opts.body
      })
    } catch (err) {
      // Network-level failure: retry with backoff.
      lastErr = err
      if (attempt === MAX_RETRIES) break
      await sleep(backoffDelay(attempt, null))
      continue
    }

    if (res.status === 401) {
      throw new UnauthorizedError(await safeText(res))
    }

    if (RETRYABLE.has(res.status) && attempt < MAX_RETRIES) {
      await sleep(backoffDelay(attempt, res.headers.get('retry-after')))
      continue
    }

    if (!res.ok) {
      throw new HttpError(
        `Request failed ${res.status} for ${url}`,
        res.status,
        await safeText(res)
      )
    }

    // 204 No Content or empty body -> return undefined-ish.
    if (res.status === 204) return undefined as unknown as T
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  throw new HttpError(
    `Request failed after ${MAX_RETRIES} retries: ${String(lastErr)}`,
    0,
    String(lastErr)
  )
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}
