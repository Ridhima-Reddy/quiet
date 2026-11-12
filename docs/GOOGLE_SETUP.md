# Google setup (one time, ~10 minutes, free)

Quiet uses **one Google account** to:

- **sync** your laptop, phone and browser — your data lives in a hidden Quiet folder in *your own* Google Drive (`drive.appdata` scope: Quiet can only see its own file, nothing else in your Drive);
- **add events and hard deadlines to Google Calendar** (with reminders, so your phone notifies you) and **read your calendar** so meetings count as busy time (`calendar.events` scope).

Google requires every app to have its own OAuth client. Do this once; everyone in your study then just clicks **Connect Google**.

## 1. Create a project and turn on the APIs

1. Open <https://console.cloud.google.com/> → project picker → **New project** → name it `Quiet`.
2. **APIs & Services → Library** → enable **Google Calendar API** and **Google Drive API**.

## 2. Consent screen

**Google Auth Platform** (or *APIs & Services → OAuth consent screen*):

1. **Branding**: app name `Quiet`, your email as support + developer contact.
2. **Audience**: *External*, publishing status **Testing**. Under **Test users** add your Gmail and every study participant's Gmail (up to 100).
3. **Data access → Add scopes**: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `.../auth/drive.appdata`, `.../auth/calendar.events`.

> While the app is in *Testing*, users see "Google hasn't verified this app" → **Continue**. That's expected for a prototype.
> In Testing mode Google expires desktop refresh tokens after 7 days, so the desktop app asks you to sign in again weekly. Switching the publishing status to *In production* (still unverified, <100 users) removes that limit.

## 3. Web client (extension + phone/web app)

**Clients → Create client → Web application**, name `Quiet Web`:

- **Authorized JavaScript origins**
  - `https://quiet-calm-planner.netlify.app` ← the phone/web app
  - `http://localhost:5173` (for `npm run serve` testing)
- **Authorized redirect URIs**
  - `https://ahdcidmacoljiikibjbmghjjdmbhpnmf.chromiumapp.org/` ← the Chrome extension (its ID is fixed by `src/static/extension-key.txt`; also printed by `npm run icons` and shown in Quiet → You → Google → Advanced)

Copy the **Client ID** and either:

- paste it into `src/config.js` → `GOOGLE_WEB_CLIENT_ID`, then `npm run build` (recommended: works for everyone), **or**
- paste it in **Quiet → You → Google → Advanced** on each device.

## 4. Desktop client (Electron app)

**Clients → Create client → Desktop app**, name `Quiet Desktop`. Copy the client ID and secret into `desktop/config.json`:

```json
{ "googleClientId": "1234-abc.apps.googleusercontent.com", "googleClientSecret": "GOCSPX-..." }
```

(For a desktop app Google treats the "secret" as non-confidential; sign-in uses PKCE. `desktop/config.json` is git-ignored.)

## 5. Connect

On every device: **Quiet → You → Connect Google** with the same Gmail. The extension and desktop app refresh access silently. On the phone/web app, access lasts about an hour; after that the sync pill says **Tap to sync** — one tap and you're caught up. Nothing is ever lost while offline: Quiet saves locally first and merges when it syncs.

## What goes to Google Calendar

| Goes to Google Calendar | Stays on your Quiet list |
|---|---|
| Events you must show up for: classes, meetings, exams, interviews, appointments, conferences (multi-day) | Flexible work: assignments, reading, revision sessions, chores |
| Hard deadlines (submissions, applications, registrations, fees) — as an all-day "Due: …" marker that doesn't block your free time | Tasks with a soft "by Friday" |
| Tasks with a specific time ("call the bank at 4pm") | Undated "anytime" tasks |

Reminders: exams 1 day + 1 hour before; meetings 30 min before; deadlines 3 days and 1 day before (9am). You can override the rule per item in its detail panel. If you move a Quiet event in Google Calendar, Quiet follows; if you delete it there, Quiet stops re-adding it.
