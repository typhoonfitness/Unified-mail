# Getting your free OAuth credentials

This app talks directly to Gmail and Microsoft Graph from your desktop. There is
no server and no paid API. You only need two free things:

1. A **Google OAuth client ID** (type: Desktop app)
2. An **Azure app registration** (public client)

Both are free. Follow the steps, then paste the results into a `.env` file
(copy `.env.example` to `.env`).

---

## Part A — Google (Gmail API)

### 1. Create a Google Cloud project

1. Go to https://console.cloud.google.com/ and sign in.
2. Top bar → project dropdown → **New Project**. Name it e.g. `unified-mail`,
   click **Create**, then select the project.

### 2. Enable the Gmail API

1. Left menu → **APIs & Services → Library**.
2. Search **Gmail API** → click it → **Enable**.

### 3. Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: choose **External** → **Create**.
3. Fill in the required fields (App name, your email for support + developer
   contact). You can leave optional fields blank. **Save and Continue.**
4. **Scopes** step: click **Add or Remove Scopes** and add these (paste into the
   filter box one at a time):
   - `.../auth/gmail.readonly`
   - `.../auth/gmail.send`
   - `.../auth/gmail.modify`
   - `.../auth/userinfo.email`
   Then **Update → Save and Continue**.
5. **Test users** step: click **Add Users** and add the Gmail address you will
   sign in with. (While the app is in "Testing" mode, only listed test users can
   sign in — that is fine for personal use, and it never expires for your own
   account.) **Save and Continue.**

### 4. Create the OAuth client ID (Desktop app)

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Desktop app**. Name it e.g. `unified-mail-desktop`.
3. Click **Create**. A dialog shows your **Client ID** and **Client secret**.
4. Copy both.

> The redirect URI is handled automatically for Desktop-app clients — Google
> allows the `http://127.0.0.1:<random-port>` loopback that this app uses, so
> you do **not** need to register a redirect URI manually.

### 5. Put them in `.env`

```
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxx
```

(The Google "client secret" for a Desktop app is not truly confidential. The app
also works with pure PKCE, but Google's token endpoint is happiest if you
include it, so paste it in.)

---

## Part B — Microsoft (Microsoft Graph API)

### 1. Open App registrations

1. Go to https://portal.azure.com/ and sign in (any personal or work Microsoft
   account works).
2. Search **App registrations** in the top bar → open it → **New registration**.

### 2. Register the app

1. **Name**: e.g. `unified-mail`.
2. **Supported account types**: choose
   **Accounts in any organizational directory (any tenant) and personal
   Microsoft accounts** (this is the "common" audience — lets you connect both
   personal Outlook.com and work/school mailboxes).
3. **Redirect URI**: set the platform dropdown to **Public client/native
   (mobile & desktop)** and enter:
   ```
   http://localhost
   ```
   (Azure requires a registered loopback host; `http://localhost` covers the
   `http://127.0.0.1:<port>/callback` and `http://localhost:<port>/callback`
   redirects this app uses. You do not need to pin a port.)
4. Click **Register**.

### 3. Confirm it's a public client

1. In the app → **Authentication**.
2. Under **Advanced settings → Allow public client flows**, set **Yes**.
   **Save.**
3. Confirm `http://localhost` appears under **Mobile and desktop applications**.
   (If you'd rather be explicit, you can also add
   `http://127.0.0.1` there.)

### 4. Add the Graph permissions (delegated)

1. In the app → **API permissions → Add a permission → Microsoft Graph →
   Delegated permissions**.
2. Add each of these:
   - `Mail.Read`
   - `Mail.Send`
   - `Mail.ReadWrite`
   - `User.Read`
   - `offline_access`
3. Click **Add permissions**. (Admin consent is **not** required for these
   delegated scopes on a personal account — you'll consent yourself at sign-in.)

### 5. Copy the client ID into `.env`

1. Go to the app's **Overview** page.
2. Copy **Application (client) ID**.

```
MICROSOFT_CLIENT_ID=00000000-0000-0000-0000-000000000000
```

> No client secret is needed for Microsoft — this is a public client using PKCE.

---

## Final `.env`

Your finished `.env` (copied from `.env.example`) should look like:

```
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxx
MICROSOFT_CLIENT_ID=00000000-0000-0000-0000-000000000000
```

Save it in the project root (next to `package.json`). It is gitignored, so it
will not be committed. Now run the app (`npm run dev`) and use the **Connect
Gmail** / **Connect Outlook** buttons.
