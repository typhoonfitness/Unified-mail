// Loopback redirect server for the desktop OAuth flow.
//
// We start a short-lived HTTP server on 127.0.0.1 with an ephemeral port, open
// the system browser (or an Electron auth window) to the provider's authorize
// URL with redirect_uri = http://127.0.0.1:<port>/callback, and wait for the
// provider to redirect back with ?code=...&state=... . The server captures the
// code, shows a "you can close this tab" page, and shuts down.

import { createServer, type Server } from 'http'
import { AddressInfo } from 'net'
import { URL } from 'url'

export interface LoopbackResult {
  code: string
  state: string | null
}

export interface LoopbackHandle {
  redirectUri: string
  // Resolves when the provider redirects back with a code (or rejects on error).
  waitForCode: (expectedState: string) => Promise<LoopbackResult>
  close: () => void
}

const SUCCESS_HTML = `<!doctype html><html><head><meta charset="utf-8">
<title>Connected</title><style>
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0b0f;color:#e6e6ea;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.card{text-align:center}h1{font-weight:600}p{color:#9a9aa5}
</style></head><body><div class="card">
<h1>&#10003; Account connected</h1><p>You can close this tab and return to the app.</p>
</div></body></html>`

const ERROR_HTML = `<!doctype html><html><head><meta charset="utf-8">
<title>Sign-in failed</title><style>
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0b0b0f;color:#e6e6ea;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.card{text-align:center}h1{font-weight:600;color:#ff6b6b}p{color:#9a9aa5}
</style></head><body><div class="card">
<h1>Sign-in failed</h1><p>Please return to the app and try again.</p>
</div></body></html>`

export interface LoopbackOptions {
  // Host used in the redirect_uri. Google works with 127.0.0.1; Microsoft
  // requires "localhost" to match a registered http://localhost redirect.
  host?: string
  // Path used in the redirect_uri. Microsoft's http://localhost registration
  // has no path, so this is '' for Microsoft and '/callback' for Google.
  redirectPath?: string
}

export async function startLoopback(
  opts: LoopbackOptions = {}
): Promise<LoopbackHandle> {
  const host = opts.host ?? '127.0.0.1'
  const redirectPath = opts.redirectPath ?? '/callback'

  let resolveCode: (r: LoopbackResult) => void
  let rejectCode: (e: Error) => void
  const codePromise = new Promise<LoopbackResult>((res, rej) => {
    resolveCode = res
    rejectCode = rej
  })

  const server: Server = createServer((req, res) => {
    if (!req.url) return
    const url = new URL(req.url, `http://${host}`)
    // Accept the OAuth response on any path: the browser may hit '/' or
    // '/callback' depending on the provider's registered redirect URI.
    const hasOAuthParams =
      url.searchParams.has('code') || url.searchParams.has('error')
    if (!hasOAuthParams) {
      res.writeHead(404)
      res.end()
      return
    }

    const error = url.searchParams.get('error')
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')

    if (error) {
      res.writeHead(400, { 'content-type': 'text/html' })
      res.end(ERROR_HTML)
      rejectCode(new Error(`OAuth error: ${error}`))
      return
    }
    if (!code) {
      res.writeHead(400, { 'content-type': 'text/html' })
      res.end(ERROR_HTML)
      rejectCode(new Error('No authorization code returned'))
      return
    }

    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(SUCCESS_HTML)
    resolveCode({ code, state })
  })

  await new Promise<void>((resolve, reject) => {
    // Port 0 = OS-assigned ephemeral port on the loopback interface only.
    server.listen(0, '127.0.0.1', resolve)
    server.on('error', reject)
  })

  const { port } = server.address() as AddressInfo
  const redirectUri = `http://${host}:${port}${redirectPath}`

  return {
    redirectUri,
    waitForCode: async (expectedState: string) => {
      const result = await codePromise
      if (result.state !== expectedState) {
        throw new Error('OAuth state mismatch (possible CSRF); aborting.')
      }
      return result
    },
    close: () => server.close()
  }
}
