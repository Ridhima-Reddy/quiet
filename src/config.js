// Google Cloud OAuth client IDs. See Desktop › Quiet docs › GOOGLE_SETUP.md (about 10 minutes, free).
// You can also paste the Web client ID in Quiet → You → Google → Advanced without rebuilding.
export const GOOGLE_WEB_CLIENT_ID = '1075904311038-5dj6v9kapinteu3kq6ien66eir5p9icq.apps.googleusercontent.com';
// Desktop app (Electron) uses a "Desktop app" OAuth client — set in desktop/config.json.

export const SCOPES = [
  'openid', 'email', 'profile',
  'https://www.googleapis.com/auth/drive.appdata',     // a hidden Quiet folder in your own Drive: how your devices sync
  'https://www.googleapis.com/auth/calendar.events',   // add exams/meetings/deadlines to your calendar and read busy time
].join(' ');

// Where the phone/web app is hosted (used for links from the extension and desktop app).
export const WEB_APP_URL = 'https://quiet-calm-planner.netlify.app/';

// Shared AI for everyone (a Netlify function that holds the key). Set to '' to require personal keys.
export const SHARED_AI_URL = 'https://quiet-calm-planner.netlify.app/api/ai';
