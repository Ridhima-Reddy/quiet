// Sync = merge with the copy in your Google Drive app folder, then pull/push Google Calendar,
// then upload. Local-first: the app always works offline and catches up when it can.
import { store } from '../core/store.js';
import { mergeStates, compact, fingerprint } from '../core/merge.js';
import { gfetch, getToken } from './auth.js';
import { pullCalendar, pushCalendar, applyPulled, listCalendars } from './gcal.js';

const DRIVE = 'https://www.googleapis.com/drive/v3', UPLOAD = 'https://www.googleapis.com/upload/drive/v3', NAME = 'quiet-state-v3.json';

async function driveFiles() {
  const q = new URLSearchParams({ spaces: 'appDataFolder', q: `name='${NAME}' and trashed=false`, fields: 'files(id,modifiedTime,createdTime)', orderBy: 'createdTime' });
  const r = await gfetch(`${DRIVE}/files?${q}`); if (!r.ok) throw new Error('Drive: ' + r.status);
  return (await r.json()).files || [];
}
// Network/HTTP errors stop the sync (never treat "couldn't read" as "empty" and overwrite your data);
// only a corrupt file is treated as empty.
async function driveGet(id) { const r = await gfetch(`${DRIVE}/files/${id}?alt=media`); if (!r.ok) throw new Error('Drive read: ' + r.status); const t = await r.text(); try { return JSON.parse(t); } catch { return null; } }
async function drivePut(id, data) {
  const body = JSON.stringify(data);
  if (id) { const r = await gfetch(`${UPLOAD}/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body }); if (!r.ok) throw new Error('Drive write: ' + r.status); return id; }
  const b = 'quiet' + Math.random().toString(36).slice(2);
  const multi = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: NAME, parents: ['appDataFolder'], mimeType: 'application/json' })}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`;
  const r = await gfetch(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'content-type': `multipart/related; boundary=${b}` }, body: multi });
  if (!r.ok) throw new Error('Drive create: ' + r.status); return (await r.json()).id;
}

async function run(interactive) {
  const token = await getToken({ interactive });
  if (!token) return { ok: false, reason: 'auth' };
  await store.setLocal({ syncing: true });
  try {
    // 1. Merge with Drive (handles the rare case of two files created at once)
    const files = await driveFiles();
    let remote = null;
    for (const f of files) { const d = await driveGet(f.id); remote = remote ? mergeStates(remote, d) : d; }
    const merged = compact(mergeStates(store.state, remote));
    if (fingerprint(merged) !== fingerprint(store.state)) await store.replace(merged);
    // 2. Google Calendar
    const prefs = store.prefs();
    let calError = '';
    try {
      if (prefs.gcalPull || prefs.gcalPush) {
        const pulled = await pullCalendar(prefs);
        const calendars = Date.now() - (store.state.gcal?.listedAt || 0) > 864e5 ? await listCalendars().catch(() => null) : store.state.gcal?.calendars;
        await store.setGcal({ events: pulled.events, pulledAt: Date.now(), calendars: calendars || store.state.gcal?.calendars || [], listedAt: calendars ? Date.now() : store.state.gcal?.listedAt || 0 });
        await applyPulled(pulled);
      }
      if (prefs.gcalPush) await pushCalendar(prefs);
    } catch (e) { if (e.auth) throw e; calError = 'Calendar: ' + e.message; }
    // 3. Upload if anything differs from Drive
    const { rev, ...final } = store.state;
    if (!remote || files.length > 1 || fingerprint(final) !== fingerprint(remote)) {
      const id = await drivePut(files[0]?.id, final);
      for (const f of files.slice(1)) gfetch(`${DRIVE}/files/${f.id}`, { method: 'DELETE' }).catch(() => {});
      if (!files.length && id) {/* created */}
    }
    await store.setLocal({ lastSync: Date.now(), syncError: calError, syncing: false });
    return { ok: true };
  } catch (e) {
    await store.setLocal({ syncError: e.auth ? '' : e.message, syncing: false });
    return { ok: false, reason: e.message };
  }
}

/** Sync once. Web Locks make sure only one window/worker syncs at a time. */
let retry = null;
export function syncNow({ interactive = false } = {}) {
  if (!globalThis.navigator?.locks) return run(interactive);
  return navigator.locks.request('quiet-sync', { ifAvailable: true }, lock => {
    if (lock) return run(interactive);
    // Another window/worker is mid-sync: try again shortly so edits made now aren't left waiting.
    clearTimeout(retry); retry = setTimeout(() => syncNow(), 8000);
    return { ok: false, reason: 'busy' };
  });
}

/** Keep syncing in the background of a page: after edits, every few minutes, and when you come back. */
export function startAutoSync({ every = 5 * 60e3 } = {}) {
  let t = null;
  const kick = (ms = 2500) => { clearTimeout(t); t = setTimeout(() => { if (store.local.google?.connected) syncNow(); }, ms); };
  store.onDirty(() => kick());
  setInterval(() => kick(0), every);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - (store.local.lastSync || 0) > 60e3) kick(300); });
  if (typeof addEventListener !== 'undefined') addEventListener('online', () => kick(500));
  kick(700);
  return kick;
}
