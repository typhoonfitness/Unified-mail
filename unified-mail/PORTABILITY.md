# Running Unified Mail on another Windows laptop

There are two ways to get Unified Mail onto a different Windows machine. The
**packaged build** is the real "portable app" — it doesn't need Node or the
source code. The **copy-the-folder** route is quick but needs Node installed.

---

## Option A — Package a standalone build (recommended)

This produces a real Windows app you can copy to any laptop. **Run these steps on
a Windows machine** (electron-builder builds Windows apps from Windows).

1. Install [Node.js LTS](https://nodejs.org) if it isn't already.
2. In the project folder:
   ```powershell
   npm install
   npm run package
   ```
3. Look in the new **`release/`** folder. You'll get:
   - **`Unified Mail Setup <version>.exe`** — a normal installer (Start Menu +
     desktop shortcut, proper taskbar icon and notification branding).
   - **`UnifiedMail-portable-<version>.exe`** — a single **portable** exe. Copy
     this one file to a USB stick or the other laptop and just double-click it —
     no install, no Node required.

### Your credentials
The app reads your Google/Microsoft client IDs from the `.env` file, which is
bundled into the build automatically. So the packaged app already knows how to
sign in. Because your `.env` is inside it, treat the exe as personal — don't
share it publicly.

---

## Option B — Copy the project folder (quick, needs Node)

1. Install [Node.js LTS](https://nodejs.org) on the other laptop.
2. Copy the whole `email project` folder over (including your `.env`).
   - You can delete `node_modules/` before copying to shrink it; it will be
     recreated.
3. On the new laptop, run **`Install Unified Mail.ps1`** (right-click → Run with
   PowerShell) to create the desktop + startup shortcuts, then launch from the
   **Unified Mail** desktop icon. First launch installs dependencies once.

---

## Notes
- The local mail cache, tokens, drafts, and settings live in the OS user-data
  folder (`%APPDATA%\Unified Mail`), separate from the app files — each laptop
  keeps its own local data and you sign in per machine.
- Auto-launch-on-login is a toggle in Settings, and the installer/portable exe
  give the best taskbar-icon and notification branding.
