// Local-first store. One synced document (state) + one device-local document (local).
// Works on chrome.storage (extension: popup, page, background and content scripts share it)
// and on localStorage (web app, phone PWA, desktop app windows).
import { COLLECTIONS, DEFAULT_PREFS, emptyState, uid } from './model.js';

const KEY = 'quiet3', LKEY = 'quiet3local';
const hasChrome = typeof chrome !== 'undefined' && chrome?.storage?.local;

const chromeAdapter = {
  async load() { const r = await chrome.storage.local.get([KEY, LKEY]); return [r[KEY] || null, r[LKEY] || null]; },
  save(s) { return chrome.storage.local.set({ [KEY]: s }); },
  saveLocal(l) { return chrome.storage.local.set({ [LKEY]: l }); },
  watch(cb) { chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && (ch[KEY] || ch[LKEY])) cb(ch[KEY]?.newValue, ch[LKEY]?.newValue); }); },
};
const webAdapter = {
  async load() { const p = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }; return [p(KEY), p(LKEY)]; },
  async save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { console.warn('Quiet: could not save', e); } },
  async saveLocal(l) { try { localStorage.setItem(LKEY, JSON.stringify(l)); } catch {} },
  watch(cb) {
    addEventListener('storage', e => {
      if (e.key !== KEY && e.key !== LKEY) return;
      const v = e.newValue ? JSON.parse(e.newValue) : null;
      e.key === KEY ? cb(v, undefined) : cb(undefined, v);
    });
  },
};
const memAdapter = () => { let s = null, l = null; return { async load() { return [s, l]; }, async save(x) { s = x; }, async saveLocal(x) { l = x; }, watch() {} }; };

const defaultLocal = () => ({ deviceId: uid('d'), google: null, lastSync: 0, syncError: '', nudgesHere: true, lastNudge: {}, dismissed: {}, ui: {} });

export function createStore(adapter = hasChrome ? chromeAdapter : typeof localStorage !== 'undefined' ? webAdapter : memAdapter()) {
  let state = emptyState(), local = defaultLocal(), rev = '', lrev = '';
  const subs = new Set(), dirtySubs = new Set();
  let ready = null;

  const notify = () => subs.forEach(f => { try { f(state, local); } catch (e) { console.error(e); } });
  const fix = s => { const e = emptyState(); s = { ...e, ...(s || {}) }; COLLECTIONS.forEach(c => { if (!s[c] || typeof s[c] !== 'object') s[c] = {}; }); if (!s.gcal) s.gcal = e.gcal; return s; };

  async function persist(markDirty = true) {
    rev = uid('r'); state = { ...state, rev };
    await adapter.save(state);
    if (markDirty) dirtySubs.forEach(f => f());
  }
  async function persistLocal() { lrev = uid('r'); local = { ...local, rev: lrev }; await adapter.saveLocal(local); }

  const api = {
    init() {
      if (ready) return ready;
      ready = (async () => {
        const [s, l] = await adapter.load();
        state = fix(s); local = { ...defaultLocal(), ...(l || {}) };
        if (!l) await persistLocal();
        adapter.watch((s2, l2) => {
          let changed = false;
          if (s2 && s2.rev !== rev) { state = fix(s2); rev = s2.rev; changed = true; }
          if (l2 && l2.rev !== lrev) { local = { ...defaultLocal(), ...l2 }; lrev = l2.rev; changed = true; }
          if (changed) notify();
        });
        notify();
        return api;
      })();
      return ready;
    },
    get state() { return state; },
    get local() { return local; },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
    onDirty(f) { dirtySubs.add(f); return () => dirtySubs.delete(f); },

    /** Apply several record writes at once. ops: [{c, rec}] or [{c, id, del:true}] */
    async write(ops, { dirty = true } = {}) {
      const now = Date.now(), next = { ...state };
      for (const op of ops) {
        const c = op.c; next[c] = next[c] === state[c] ? { ...state[c] } : next[c];
        if (op.del) { const old = next[c][op.id]; if (old) next[c][op.id] = { id: op.id, del: true, u: now, ...(op.keep || {}) }; }
        // soft: bookkeeping (e.g. Google Calendar ids) that must not outrank a real edit made elsewhere
        else next[c][op.rec.id] = { ...op.rec, u: op.soft ? (state[c][op.rec.id]?.u || 0) + 1 : now };
      }
      state = next; notify(); await persist(dirty);
    },
    put(c, rec) { return api.write([{ c, rec }]); },
    patch(c, id, fields) { const old = state[c][id]; if (!old || old.del) return; return api.write([{ c, rec: { ...old, ...fields } }]); },
    remove(c, id) { return api.write([{ c, id, del: true }]); },
    /** Replace the whole synced document (after a sync merge). */
    async replace(s, { dirty = false } = {}) { state = fix(s); notify(); await persist(dirty); },
    async setGcal(g) { state = { ...state, gcal: { ...state.gcal, ...g, u: Date.now() } }; notify(); await persist(false); },
    async setLocal(patch) { local = { ...local, ...(typeof patch === 'function' ? patch(local) : patch) }; notify(); await persistLocal(); },

    // ---- convenience reads ----
    list(c) { return Object.values(state[c] || {}).filter(r => r && !r.del); },
    prefs() {
      const p = { ...DEFAULT_PREFS, aiKey: '' };
      for (const r of Object.values(state.prefs)) { if (!r || r.del) continue; if (r.id in DEFAULT_PREFS || r.id === 'aiKey' || r.id.startsWith('x.')) p[r.id] = r.v; }
      p.nudges = { ...DEFAULT_PREFS.nudges, ...(p.nudges || {}) };
      return p;
    },
    setPref(k, v) { return api.put('prefs', { id: k, v }); },
    setPrefs(obj) { return api.write(Object.entries(obj).map(([id, v]) => ({ c: 'prefs', rec: { id, v } }))); },
  };
  return api;
}

export const store = createStore();
