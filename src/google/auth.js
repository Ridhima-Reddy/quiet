// Google sign-in for each platform. All of them end with an access token in device-local storage.
//  - Chrome extension: chrome.identity.launchWebAuthFlow (silent refresh works in the background)
//  - Desktop (Electron): system-browser sign-in with PKCE + refresh token, handled in the main process
//  - Web / phone: Google Identity Services token client (a one-tap popup when the token expires)
import { store } from '../core/store.js';
import { isExt, isDesktop } from '../core/platform.js';
import { GOOGLE_WEB_CLIENT_ID, SCOPES } from '../config.js';

export const clientId = () => (store.local.googleClientId || GOOGLE_WEB_CLIENT_ID || '').trim();
export const googleConfigured = () => isDesktop ? true : !!clientId();

async function extAuth(interactive, hint, first) {
  const redirect = chrome.identity.getRedirectURL();
  const q = new URLSearchParams({ client_id: clientId(), response_type: 'token', redirect_uri: redirect, scope: SCOPES, include_granted_scopes: 'true', prompt: interactive ? (first ? 'select_account consent' : 'select_account') : 'none' });
  if (hint) q.set('login_hint', hint);
  try {
    const url = await chrome.identity.launchWebAuthFlow({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + q, interactive });
    const h = new URLSearchParams(new URL(url).hash.slice(1));
    if (!h.get('access_token')) return null;
    return { token: h.get('access_token'), exp: Date.now() + (+h.get('expires_in') || 3600) * 1000 };
  } catch (e) { if (interactive) throw new Error(e.message || 'Sign-in was cancelled'); return null; }
}

let gisReady = null;
const loadGIS = () => gisReady || (gisReady = new Promise((res, rej) => {
  if (globalThis.google?.accounts?.oauth2) return res();
  const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
  s.onload = () => res(); s.onerror = () => { gisReady = null; rej(new Error('Could not load Google sign-in (offline?)')); };
  document.head.append(s);
}));
async function webAuth(interactive, hint, first) {
  if (!interactive) return null; // GIS needs a tap; we show a quiet "tap to sync" pill instead
  await loadGIS();
  return new Promise((res, rej) => {
    const c = google.accounts.oauth2.initTokenClient({
      client_id: clientId(), scope: SCOPES, include_granted_scopes: true, login_hint: hint || undefined,
      callback: r => r.error ? rej(new Error(r.error_description || r.error)) : res({ token: r.access_token, exp: Date.now() + (+r.expires_in || 3600) * 1000 }),
      error_callback: e => rej(new Error(e?.type === 'popup_closed' ? 'Sign-in window was closed' : e?.message || 'Sign-in failed')),
    });
    c.requestAccessToken({ prompt: first ? 'select_account consent' : '' });
  });
}
async function desktopAuth(interactive, force) {
  const r = await globalThis.quietNative.googleToken({ interactive, scopes: SCOPES, force });
  return r?.token ? r : null;
}

let inflight = null;
/** A valid access token, or null if one can't be had without user interaction. */
export async function getToken({ interactive = false, force = false } = {}) {
  const g = store.local.google;
  if (!force && g?.token && g.exp > Date.now() + 90e3) return g.token;
  if (!interactive && !g?.connected) return null;
  if (!googleConfigured()) { if (interactive) throw new Error('Google sign-in is not set up yet — see docs/GOOGLE_SETUP.md'); return null; }
  if (inflight) return inflight;
  inflight = (async () => {
    const first = !g?.connected, hint = g?.email;
    const r = isDesktop ? await desktopAuth(interactive, force) : isExt ? await extAuth(interactive, hint, first) : await webAuth(interactive, hint, first);
    if (!r) { if (g?.connected) await store.setLocal({ google: { ...store.local.google, token: null, needsTap: true } }); return null; }
    let profile = { email: g?.email, name: g?.name, picture: g?.picture };
    if (first || !g?.email) {
      try { const u = await (await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { authorization: 'Bearer ' + r.token } })).json(); profile = { email: u.email, name: u.name, picture: u.picture }; } catch {}
    }
    await store.setLocal({ google: { ...profile, token: r.token, exp: r.exp, connected: true, needsTap: false, since: g?.since || Date.now() } });
    if (profile.name && !store.prefs().name) await store.setPref('name', profile.name.split(' ')[0]);
    return r.token;
  })();
  try { return await inflight; } finally { inflight = null; }
}

export async function disconnect() {
  const t = store.local.google?.token;
  if (t) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t), { method: 'POST' }).catch(() => {});
  if (isDesktop) await globalThis.quietNative.googleSignOut?.();
  await store.setLocal({ google: null });
}

/** fetch() with the Google token; refreshes once on 401. */
export async function gfetch(url, opts = {}) {
  const send = t => fetch(url, { ...opts, headers: { ...(opts.headers || {}), authorization: 'Bearer ' + t } });
  const noAuth = () => { const e = new Error('Not signed in to Google'); e.auth = true; return e; };
  const token = await getToken();
  if (!token) throw noAuth();
  const r = await send(token);
  if (r.status !== 401) return r;
  // Token was revoked or expired early: get a genuinely fresh one (bypassing any cache) and retry once.
  await store.setLocal({ google: { ...store.local.google, token: null, exp: 0 } });
  const fresh = await getToken({ force: true });
  if (!fresh) throw noAuth();
  return send(fresh);
}
