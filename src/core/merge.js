// Record-level last-writer-wins merge. Two devices editing different things never clobber each other;
// the same record edited on two devices keeps the most recent edit. Deletes are tombstones.
import { COLLECTIONS, emptyState } from './model.js';

const pick = (a, b) => {
  if (!a) return b; if (!b) return a;
  if ((a.u || 0) !== (b.u || 0)) return (a.u || 0) > (b.u || 0) ? a : b;
  if (a.del !== b.del) return a.del ? a : b;               // tie: a delete wins
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;  // deterministic tie-break
};

export function mergeStates(a, b) {
  a = a || emptyState(); b = b || emptyState();
  const out = emptyState();
  for (const c of COLLECTIONS) {
    const A = a[c] || {}, B = b[c] || {}, ids = new Set([...Object.keys(A), ...Object.keys(B)]);
    for (const id of ids) {
      let w = pick(A[id], B[id]);
      // A delete made on a device that never saw the Google Calendar link must still remove the event.
      const lose = w === A[id] ? B[id] : A[id];
      if (w?.del && !w.gcal && lose?.gcal?.id) w = { ...w, gcal: lose.gcal };
      out[c][id] = w;
    }
  }
  out.gcal = (a.gcal?.u || 0) >= (b.gcal?.u || 0) ? (a.gcal || out.gcal) : b.gcal;
  return out;
}

/** Drop tombstones older than maxDays so the file doesn't grow forever. */
export function compact(state, maxDays = 60) {
  const cut = Date.now() - maxDays * 864e5, out = { ...state };
  for (const c of COLLECTIONS) {
    out[c] = {};
    for (const [id, r] of Object.entries(state[c] || {})) if (!(r?.del && (r.u || 0) < cut)) out[c][id] = r;
  }
  return out;
}

/** Stable fingerprint of the synced content (ignores local rev). */
export function fingerprint(state) {
  let h = 2166136261;
  const s = JSON.stringify(COLLECTIONS.map(c => Object.keys(state[c] || {}).sort().map(id => [id, state[c][id]?.u || 0, state[c][id]?.del ? 1 : 0])).concat([[state.gcal?.u || 0]]));
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
