# Unified Mail — Dashboard module (archive)

This folder holds the optional **CRT "Start Page" dashboard** that was split out
of the main [`../unified-mail`](../unified-mail) app to keep that repo under 100
files. Nothing here is a standalone app on its own; it's the dashboard source,
preserved so you can add it back whenever you want.

## What's in here

- `src/main/dashboard/` — dashboard config + data proxies (weather, markets,
  calendar, news, social, to-dos, quick links).
- `src/main/media/` — the `media://` protocol + local media library (gifs,
  ambient sounds, music).
- `src/main/ipc/dashboard.ts` — the `dash:*` IPC handlers.
- `src/renderer/src/components/Dashboard.tsx` + `components/dashboard/*` — the
  dashboard UI and all the cards.
- `src/renderer/src/components/BackgroundAudio.tsx` — persistent audio bus.
- `src/renderer/src/lib/` — `audioBus.ts`, `broker.ts`, `pdf.ts`, `tts.ts`
  (+ test), `visualizer.ts`.

## How to fold it back into the mail app

Copy these folders/files back into `../unified-mail` at the same paths, then
re-add the wiring that was removed during the split:

1. **`src/renderer/src/main.tsx`** — import and render `BackgroundAudio`.
2. **`src/renderer/src/App.tsx`** — restore the `'dashboard'` view and the
   `Dashboard` component, and pass `onGoDashboard` to `Inbox`.
3. **`src/renderer/src/components/Inbox.tsx`** — restore the `onGoDashboard`
   prop and the "← dashboard" button.
4. **`src/main/index.ts`** — restore `registerMediaScheme()`,
   `handleMediaProtocol()`, and `registerDashboardIpc()`.
5. **`src/preload/index.ts`** — restore the `dashboard: { … }` API block.
6. **`src/shared/types.ts`** — restore the Dashboard types block and
   `dashboard: DashboardApi` in `ExposedApi`.

The full versions of these files (with the dashboard wiring intact) are in your
original **`email project`** folder if you'd rather copy from there.
