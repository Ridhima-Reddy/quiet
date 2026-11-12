# Quiet

A calm AI companion that holds what's on your mind, turns it into a realistic plan, and looks after your wellbeing while you work through it. One codebase, three apps, synced through one Google account:

| App | Where it lives | Build output |
|---|---|---|
| **Chrome extension** | toolbar popup (today at a glance), full app tab, companion nudges on the page you're reading, badge with what's left today | `dist/extension` |
| **Desktop app** (Windows/macOS/Linux) | full app window + a small always-on-top companion on your screen with your next task, tray icon, `Ctrl+Shift+Space` brain dump from anywhere, launch at login | `desktop/` |
| **Phone app** (Android & iPhone) | installable web app (Add to Home Screen), works offline, long-press to drag, app shortcuts for Brain dump / Today / Focus | `dist/web` |

## Quick start

```bash
npm install
npm run build          # builds all three
npm test               # planner / parser / calendar-rule tests
npm run e2e            # drives the real UI in Chrome (desktop, dark mode, phone)
node tests/e2e/extension.mjs   # loads the extension in Chrome and checks it
```

- **Chrome extension:** `chrome://extensions` → Developer mode → **Load unpacked** → `dist/extension`.
- **Desktop app:** `cd desktop && npm install && npm start`. Installer: `npm run dist` → `desktop/out/`.
- **Phone:** open **<https://quiet-calm-planner.netlify.app>** on your phone → **Add to Home Screen** (iPhone: Share menu; Android: ⋮ → Install app). Publish changes with `npm run deploy` (builds, then deploys `dist/web` to Netlify). For a quick local look: `npm run serve` → <http://localhost:5173>.
- **Sync + Google Calendar:** one-time setup in [docs/GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md). Until then everything works on each device on its own.
- **AI (optional):** You → AI. Groq has a free tier; Gemini, OpenAI and Anthropic Claude also work. Without a key, a built-in offline sorter handles dates, times, exams, deadlines, worries and habits.

## What it does (mapped to the user survey)

| Survey ask | In Quiet |
|---|---|
| Brain dump → plan (most liked) | Type (or speak, or attach the assignment PDF/photo) everything; Quiet separates tasks, events, deadlines, habits and worries, and shows exactly where each landed and why |
| Speak instead of typing | Mic button — browser dictation, or Whisper/Gemini transcription in the desktop app |
| Big tasks in doable chunks (+ upload the file) | Tasks ≥ 45 min get "Break it into steps": one small chunk at a time, grounded in the attached file. Small tasks are never chunked |
| Exam prep / big work spread across the week | Big tasks (≥ 2h) are split into 60–90 min sessions across the days before the deadline; exams get a prep task automatically |
| Meeting & deadline reminders on your phone | Events, hard deadlines and timed tasks go to Google Calendar with reminders → your phone's calendar notifies you |
| Sync between phone and laptop | Google Drive app folder sync, record-level merge, offline-first |
| Sync with Google Calendar | Two-way: Quiet pushes events/deadlines; your Google events show in Quiet and count as busy time |
| Focus timer (Pomodoro) | Focus mode with 15–90 min timers, breaks, nudges paused, focus time logged |
| Weekly summary | Week page: things done, hours, work by day, energy trend, time per goal, habits, AI reflection, "worth reconsidering" |
| Habit tracking | Gentle weekly targets (gym 3×, read 5×…), one-tap on Today |
| Track mood/energy | One-tap energy check-in that actually changes the plan (low energy → lighter today, gentler first task); evening "how did today feel?" |
| Flags tasks that don't fit your goals | Goal tags, time-per-goal chart, "worth reconsidering" list for undated, unaligned, lingering tasks |
| Widgets on laptop/phone | Desktop companion widget; extension popup + badge; phone app shortcuts |
| "If it feels like a task I'll fall off" | No mandatory setup; one brain-dump box; everything else is automatic and one tap |

### How planning works

1. Meetings/classes (Quiet + Google Calendar) are subtracted from each day.
2. Each day holds at most your **focus hours**; today only holds what's left of today, scaled by your energy.
3. **Today's list is sticky** — new things don't push existing ones around mid-day.
4. Most urgent first. Small tasks go in a short window just before they're due, on the **least-loaded day** — a busy today won't get a task that isn't due yet. Only big tasks are split across days. Hard deadlines keep a buffer day.
5. If nothing fits, the task is flagged **tight** instead of silently overloading a day.
6. Undated tasks wait in **Anytime**; Today suggests one "if you have room".

### The personal-assistant layer

- Notices **heavy stretches** (3+ full days, or 4 of the last 7), late nights, low-energy days and over-full days, and offers to **lighten tomorrow**, ease the next 3 days, or trim today — moving only what can safely wait.
- Morning briefing, "start here" with a reason ("due tomorrow · fits before your 3pm class"), "something else" if it doesn't feel right.
- Confetti, a soft sound and a "good job" on every check-off (with undo); a bigger celebration when today is clear.

## Project layout

```
src/core      planner, actions, wellbeing, extraction (AI + offline), nudges, store + merge
src/google    sign-in per platform, Drive sync, Calendar sync
src/ui        Preact UI (views, sheets), design system, companion, confetti, drag & drop
src/entries   app, popup, background (extension), content (nudges), widget (desktop)
desktop/      Electron shell (main.js, preload.js)
tests/        unit tests + Chrome end-to-end tests
```

## Study mode

You → Study mode → Open evaluation: mark each extracted item (correct? goal tag right? placed sensibly?), count misses, rate "start here", answer the questionnaire, export CSV.

## Known limits

- **Phone nudges** (water, breaks) only appear while the phone app is open — web apps can't schedule background notifications without a push server. Meeting/deadline reminders reach your phone via Google Calendar, and there's an optional daily "Wind down" calendar reminder.
- The phone app is an installable web app, not a Play Store/App Store listing. A home-screen widget needs a native app.
- In Google's *Testing* mode, the desktop app asks you to sign in again every 7 days.
