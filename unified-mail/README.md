# Unified Mail

A free, open-source desktop unified inbox that combines **Gmail** and
**Outlook / Microsoft 365** into one fast, keyboard-driven app, with an optional
CRT/terminal-style dashboard. It runs entirely on your machine: no backend
server, no paid API required, and all mail, tokens, and settings stay local.

Bring your own free OAuth credentials (see
[SETUP_CREDENTIALS.md](./SETUP_CREDENTIALS.md)) and run it.

> **Note on distribution:** this project is meant to be cloned and run with
> *your own* Google/Microsoft OAuth credentials. Never commit your `.env` or
> ship a build with your credentials inside it. See "Security & credentials"
> below.

## Features

**Mail**

- Unified inbox across Gmail + Outlook, with threads merged across providers.
- Local-first: everything reads from a SQLite cache, so the UI is instant;
  full sync on connect and incremental delta sync in the background.
- Compose / reply / reply-all / forward routed to the right provider, rich-text
  editor, drag-and-drop attachments, autosaved local drafts.
- Send queue with **undo send** (configurable window), **send later**, and
  retry/backoff.
- **Snooze**, **mark all as read**, multi-select bulk actions, shared Archive,
  contact autocomplete, working links, and opt-in remote image loading.
- Search: full-text (FTS5), `from:` sender search, and saved searches.
- **Smart filters:** People, Promotions/Ads, Social updates, Account alerts,
  News, Has-dates, and an Important (VIP) split inbox.

**Productivity**

- **Auto-triage rules:** match incoming mail on sender / subject / category and
  auto-archive, mark read, star, or trash.
- **Remind me if no reply:** re-surfaces a thread in a Follow-ups view if no
  reply arrives in time.
- **Bulk unsubscribe manager:** lists newsletter senders with counts and
  one-click unsubscribe + archive-all.
- **Attachment browser:** search/filter attachments (PDF, image, doc, sheet,
  archive) across all accounts.
- **Multiple signatures** per account with a compose-time picker.
- Command palette (Cmd/Ctrl+K), full keyboard nav with a cheat sheet (`?`), and
  slash-command snippets.

**AI (optional, bring your own key)**

- Summarize a thread, draft a reply, and an **AI digest** of your inbox for
  today / last 7 days / last 30 days / unread.
- Providers: **Anthropic (Claude)**, **OpenAI**, or **Azure OpenAI / any
  OpenAI-compatible endpoint**. Configure in Settings → AI. Your key is stored
  locally and only sent to the provider you choose.

> **Optional dashboard / "Start Page":** the CRT dashboard (weather, markets,
> news, calendar, music player, screensaver, PDF reader/TTS, to-dos, quick
> links) lives in the companion folder **`../unified-mail-dashboard`** to keep
> this repo focused on mail. See that folder's README to fold it back in.

**Daily use**

- System tray with unread count, native notifications with do-not-disturb,
  launch-on-login, themes (dark CRT + light), phosphor colors, fonts, and an
  offline banner.

## Stack

- **Electron + React + TypeScript** via [electron-vite](https://electron-vite.org)
- **better-sqlite3** for the local cache (in the OS user-data directory)
- **Gmail API** + **Microsoft Graph API** (public desktop clients, PKCE)
- **electron-builder** for packaging

## Security & credentials

- `contextIsolation: true`, `nodeIntegration: false`. The renderer only sees a
  small typed API exposed through a preload `contextBridge`.
- OAuth runs entirely on the desktop with a **loopback redirect** on
  `127.0.0.1` and **PKCE**.
- Refresh/access tokens are **encrypted at rest** with Electron's `safeStorage`
  (OS keychain-backed) and stored as ciphertext in SQLite. Plaintext tokens
  never leave the main process.
- Your OAuth client IDs live in `.env`, which is **gitignored**. Each person who
  runs this creates their own free Google/Azure credentials. Do not commit
  `.env` and do not distribute a packaged build that bundles it.

## Quick start

### 1. Get your free credentials

Follow **[SETUP_CREDENTIALS.md](./SETUP_CREDENTIALS.md)** to create a Google
Cloud OAuth **Desktop app** client ID and an Azure **app registration** (public
client). Both are free.

```bash
cp .env.example .env    # then edit .env with your IDs
```

### 2. Install and run

```bash
npm install
npm run dev
```

The app opens on the **Connect** screen. Connect Gmail and/or Outlook; each
opens a sign-in window, and tokens are stored encrypted locally.

> On Google's OAuth "testing" mode you can add up to 100 accounts as test users
> without any verification, which is plenty for personal use.

## Scripts

| Script              | What it does                               |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Run in development with hot reload         |
| `npm run typecheck` | Type-check main, preload, and renderer     |
| `npm test`          | Run unit tests (Vitest)                    |
| `npm run build`     | Build production bundles                   |
| `npm run package`   | Build + package installers (electron-builder) |

On Windows you can also double-click **`Build Windows App.bat`**, which finds
Node even if it isn't on your PATH, installs dependencies, and packages the app.

## Packaging a release

```bash
npm run package
```

Produces an installer for your current OS (`.exe` NSIS + portable on Windows,
`.dmg` on macOS, `.AppImage` on Linux). Cross-building for another OS generally
requires being on that OS (or CI). Unsigned Windows builds will show a
SmartScreen "unknown publisher" warning unless you add a code-signing
certificate.

## Project layout

```
src/
  main/        # Electron main process (Node): auth, db, sync, ipc, ai
  preload/     # contextBridge: exposes a minimal typed window.api
  renderer/    # React UI (inbox, compose, settings, dashboard)
  shared/      # types shared across processes
build/         # app icons
```

## Publishing this to your own GitHub

From the project folder:

```bash
git init
git add .
git commit -m "Unified Mail"
# create an empty repo on github.com first, then:
git remote add origin https://github.com/<you>/unified-mail.git
git branch -M main
git push -u origin main
```

`.gitignore` already excludes `.env`, `node_modules/`, and build output, so your
credentials and heavy artifacts stay out of the repo. Attach built installers to
a GitHub **Release** if you want to share ready-to-run downloads.

## License

[MIT](./LICENSE)
