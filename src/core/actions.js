// Every user action lives here, so the extension popup, the full app, the desktop widget and the
// phone all behave the same. Each action returns an undo function where that makes sense.
import { store } from './store.js';
import { addDays, todayISO, dow, range, daysBetween } from './dates.js';
import { makeItem, uid } from './model.js';
import { sid } from './planner.js';

const S = () => store.state;
const sessionsOf = itemId => Object.values(S().sessions).filter(s => s && !s.del && s.itemId === itemId);
const clean = s => { const { derived, n, of, risk, carried, ...rest } = s; return rest; };

/** Persist today's auto-planned sessions so today's list stays put for the rest of the day. */
export async function lockToday(p) {
  const fresh = (p.toLock || []).filter(s => !S().sessions[s.id] || S().sessions[s.id].del);
  if (fresh.length) await store.write(fresh.map(s => ({ c: 'sessions', rec: { ...clean(s), lock: true } })));
}

/** Check / uncheck one planned session (works for any day, including derived future sessions). */
export async function toggleSession(s, p) {
  const it = S().items[s.itemId]; if (!it) return;
  const cur = S().sessions[s.id];
  if (s.done) {
    const ops = [{ c: 'sessions', rec: { ...clean(cur || s), done: false, doneAt: null } }];
    if (it.status === 'done') ops.push({ c: 'items', rec: { ...it, status: 'open', doneAt: null } });
    await store.write(ops);
    return null;
  }
  const now = Date.now();
  const ops = [{ c: 'sessions', rec: { ...clean(cur || s), done: true, doneAt: now } }];
  const others = (p?.sessions || sessionsOf(s.itemId)).filter(x => x.itemId === s.itemId && x.id !== s.id && !x.done);
  const doneMin = sessionsOf(s.itemId).filter(x => x.done && x.id !== s.id).reduce((a, x) => a + x.minutes, 0) + s.minutes;
  const finished = !others.length || doneMin >= it.effort - 5;
  let removed = [];
  if (finished) {
    ops.push({ c: 'items', rec: { ...it, status: 'done', doneAt: now } });
    removed = others.filter(x => S().sessions[x.id] && !S().sessions[x.id].del);
    removed.forEach(x => ops.push({ c: 'sessions', id: x.id, del: true }));
  }
  await store.write(ops);
  return { finished, part: s.n, of: s.of, undo: async () => {
    const back = [{ c: 'sessions', rec: { ...clean(cur || s), done: false, doneAt: null } }];
    if (finished) back.push({ c: 'items', rec: { ...it, status: 'open', doneAt: null } });
    removed.forEach(x => back.push({ c: 'sessions', rec: clean(x) }));
    await store.write(back);
  } };
}

/** Mark a whole task done (from the task list / board / detail). */
export async function setItemDone(itemId, done = true) {
  const it = S().items[itemId]; if (!it) return;
  const now = Date.now(), today = todayISO();
  const before = sessionsOf(itemId).map(x => ({ ...x }));
  const ops = [{ c: 'items', rec: { ...it, status: done ? 'done' : 'open', doneAt: done ? now : null } }];
  if (done) {
    for (const s of before) {
      if (s.done) continue;
      if (s.date === today) ops.push({ c: 'sessions', rec: { ...s, done: true, doneAt: now } });
      else if (s.date > today) ops.push({ c: 'sessions', id: s.id, del: true });
    }
    // Nothing planned today? Record the work as done today so it counts.
    if (!before.some(s => s.date === today) && it.kind === 'task') ops.push({ c: 'sessions', rec: { id: sid(itemId, today), itemId, date: today, minutes: Math.max(5, it.effort - before.filter(s => s.done).reduce((a, s) => a + s.minutes, 0)), done: true, doneAt: now, quick: true } });
  } else {
    for (const s of before) if (s.quick && s.date === today) ops.push({ c: 'sessions', id: s.id, del: true });
  }
  await store.write(ops);
  return { undo: async () => {
    const back = [{ c: 'items', rec: it }];
    const ids = new Set(before.map(s => s.id));
    for (const s of before) back.push({ c: 'sessions', rec: s });
    for (const s of sessionsOf(itemId)) if (!ids.has(s.id)) back.push({ c: 'sessions', id: s.id, del: true });
    await store.write(back);
  } };
}

/** Move a planned session to another day (drag & drop). */
export async function moveSession(s, toDate) {
  const it = S().items[s.itemId]; if (!it || s.date === toDate || s.done) return null;
  const before = [S().sessions[s.id], S().sessions[sid(it.id, toDate)]].filter(Boolean).map(x => ({ ...x }));
  const ops = [];
  if (S().sessions[s.id] && !S().sessions[s.id].del) ops.push({ c: 'sessions', id: s.id, del: true });
  const target = S().sessions[sid(it.id, toDate)];
  const minutes = (target && !target.del && !target.done ? target.minutes : 0) + s.minutes;
  ops.push({ c: 'sessions', rec: { id: sid(it.id, toDate), itemId: it.id, date: toDate, minutes, done: false, pinned: true } });
  await store.write(ops);
  const late = it.due && toDate > it.due;
  return { late, undo: async () => {
    const back = [{ c: 'sessions', id: sid(it.id, toDate), del: true }];
    before.forEach(x => back.push({ c: 'sessions', rec: x }));
    await store.write(back);
  } };
}

/** Put an unscheduled (Anytime) task on a specific day. */
export async function pinItemToDay(itemId, date) {
  const it = S().items[itemId]; if (!it) return;
  if (it.kind === 'event') return moveEvent(itemId, date);
  const id = sid(itemId, date), cur = S().sessions[id];
  const doneMin = sessionsOf(itemId).filter(s => s.done).reduce((a, s) => a + s.minutes, 0);
  await store.put('sessions', { id, itemId, date, minutes: cur && !cur.del ? cur.minutes : Math.max(10, Math.min(it.effort - doneMin, 120)), done: false, pinned: true });
  return { undo: () => cur ? store.put('sessions', cur) : store.remove('sessions', id) };
}

export async function moveEvent(itemId, date) {
  const it = S().items[itemId]; if (!it || it.kind !== 'event') return;
  const shift = it.date ? daysBetween(it.date, date) : 0;
  await store.put('items', { ...it, date, endDate: it.endDate ? addDays(it.endDate, shift) : null });
  return { undo: () => store.put('items', it) };
}

/** Board buckets (Trello-style columns). */
export const BUCKETS = [
  { id: 'today', title: 'Today' }, { id: 'tomorrow', title: 'Tomorrow' }, { id: 'week', title: 'This week' },
  { id: 'nextweek', title: 'Next week' }, { id: 'later', title: 'Later' }, { id: 'anytime', title: 'Anytime' },
];
export function bucketOf(date, today = todayISO()) {
  if (!date) return 'anytime';
  if (date <= today) return 'today';
  if (date === addDays(today, 1)) return 'tomorrow';
  const sun = addDays(today, (7 - dow(today)) % 7);
  if (date <= sun) return 'week';
  if (date <= addDays(sun, 7)) return 'nextweek';
  return 'later';
}
export async function moveToBucket(itemId, bucket, p) {
  const it = S().items[itemId]; if (!it) return;
  const today = p.today, tomorrow = addDays(today, 1), sun = addDays(today, (7 - dow(today)) % 7);
  const next = p.sessions.filter(s => s.itemId === itemId && !s.done).sort((a, b) => a.date.localeCompare(b.date))[0];
  const leastLoaded = days => { let b = days[days.length - 1], br = Infinity; for (const d of days) { const c = p.cap(d); if (c <= 0) continue; const r = (p.used[d] || 0) / c; if (r < br) { br = r; b = d; } } return b; };
  const prev = { ...it }, prevSess = sessionsOf(itemId).map(x => ({ ...x }));
  const restore = async () => { const back = [{ c: 'items', rec: prev }]; const ids = new Set(prevSess.map(s => s.id)); prevSess.forEach(s => back.push({ c: 'sessions', rec: s })); sessionsOf(itemId).forEach(s => { if (!ids.has(s.id)) back.push({ c: 'sessions', id: s.id, del: true }); }); await store.write(back); };
  if (bucket === 'anytime' || bucket === 'later') {
    const ops = [{ c: 'items', rec: { ...it, due: bucket === 'anytime' ? null : it.due, hard: bucket === 'anytime' ? false : it.hard, start: bucket === 'later' ? addDays(sun, 8) : null } }];
    sessionsOf(itemId).filter(s => !s.done && s.date >= today).forEach(s => ops.push({ c: 'sessions', id: s.id, del: true }));
    await store.write(ops); return { undo: restore };
  }
  let date = bucket === 'today' ? today : bucket === 'tomorrow' ? tomorrow
    : bucket === 'week' ? leastLoaded(range(addDays(today, 2) > sun ? sun : addDays(today, 2), sun))
    : leastLoaded(range(addDays(sun, 1), addDays(sun, 7)));
  if (it.kind === 'event') { await moveEvent(itemId, date); return { undo: restore }; }
  if (it.start && it.start > date) await store.put('items', { ...it, start: null });
  if (next) await moveSession(next, date); else await pinItemToDay(itemId, date);
  return { undo: restore, late: it.due && date > it.due };
}

export async function addItems(list) {
  const items = list.map(x => makeItem(x));
  await store.write(items.map(rec => ({ c: 'items', rec })));
  return { items, undo: () => store.write(items.map(i => ({ c: 'items', id: i.id, del: true }))) };
}
export async function updateItem(id, fields) {
  const it = S().items[id]; if (!it) return;
  const next = { ...it, ...fields }, ops = [{ c: 'items', rec: next }];
  const replan = ['effort', 'due', 'hard', 'start', 'load', 'kind'].some(k => k in fields && fields[k] !== it[k]);
  if (replan) for (const s of sessionsOf(id)) if (!s.done && s.lock && !s.pinned && s.date >= todayISO()) ops.push({ c: 'sessions', id: s.id, del: true });
  if ('effort' in fields) { // keep pinned sessions inside the new effort
    const done = sessionsOf(id).filter(s => s.done).reduce((a, s) => a + s.minutes, 0);
    for (const s of sessionsOf(id)) if (!s.done && s.pinned && s.minutes > next.effort - done) ops.push({ c: 'sessions', rec: { ...s, minutes: Math.max(5, next.effort - done) } });
  }
  await store.write(ops);
  return { undo: () => store.put('items', it) };
}
export async function deleteItem(id) {
  const it = S().items[id]; if (!it) return;
  const ss = sessionsOf(id).map(x => ({ ...x }));
  await store.write([{ c: 'items', id, del: true, keep: it.gcal ? { gcal: it.gcal } : null }, ...ss.filter(s => !s.done).map(s => ({ c: 'sessions', id: s.id, del: true }))]);
  return { undo: () => store.write([{ c: 'items', rec: it }, ...ss.map(s => ({ c: 'sessions', rec: s }))]) };
}

/** Free up a day: lower its capacity and move the least urgent work to lighter days before their deadlines. */
export function planLighten(p, day, items, target = 0.5) {
  const list = (p.byDay[day] || []).filter(s => !s.done && !(s.pinned && !s.by));
  const fullCap = day === p.today ? p.cap(day) + p.doneToday : p.cap(day);
  const goal = Math.round(Math.max(30, fullCap) * target);
  let load = (p.byDay[day] || []).filter(s => !s.done).reduce((a, s) => a + s.minutes, 0);
  const slackEnd = it => it.due ? (it.hard || it.prepFor ? addDays(it.due, -1) : it.due) : addDays(day, 7);
  const cands = list.map(s => ({ s, it: items[s.itemId] })).filter(x => x.it && slackEnd(x.it) > day)
    .sort((a, b) => slackEnd(b.it).localeCompare(slackEnd(a.it)) || (a.it.hard - b.it.hard) || ((a.it.goals || []).length - (b.it.goals || []).length) || b.s.minutes - a.s.minutes);
  const used = { ...p.used }, moves = [];
  for (const { s, it } of cands) {
    if (load <= goal) break;
    let best = null, br = Infinity;
    for (const d of range(addDays(day, 1), slackEnd(it))) {
      if (d === day || p.byDay[d]?.some(x => x.itemId === it.id)) continue;
      const c = p.cap(d); if (c <= 0) continue;
      const r = ((used[d] || 0) + s.minutes) / c;
      if (r <= 0.85 && r < br) { br = r; best = d; }
    }
    if (!best) continue;
    moves.push({ s, it, to: best }); used[best] = (used[best] || 0) + s.minutes; load -= s.minutes;
  }
  return { moves, goal, before: (p.byDay[day] || []).filter(s => !s.done).reduce((a, s) => a + s.minutes, 0), after: load };
}
export async function applyLighten(day, proposal) {
  const capKey = 'x.cap.' + day, prevCap = S().prefs[capKey];
  const ops = [{ c: 'prefs', rec: { id: capKey, v: proposal.after } }];
  const back = [prevCap ? { c: 'prefs', rec: prevCap } : { c: 'prefs', id: capKey, del: true }];
  for (const { s, it, to } of proposal.moves) {
    const old = S().sessions[s.id];
    if (old && !old.del) { ops.push({ c: 'sessions', id: s.id, del: true }); back.push({ c: 'sessions', rec: old }); }
    ops.push({ c: 'sessions', rec: { id: sid(it.id, to), itemId: it.id, date: to, minutes: s.minutes, done: false, pinned: true, by: 'lighten' } });
    back.push({ c: 'sessions', id: sid(it.id, to), del: true });
  }
  await store.write(ops);
  return { undo: () => store.write(back) };
}

// ---- habits, check-ins, parked thoughts, focus ----
export const toggleHabit = async (habitId, date) => {
  const id = `${habitId}@${date}`, cur = S().habitLogs[id];
  if (cur && !cur.del) await store.remove('habitLogs', id); else await store.put('habitLogs', { id, habitId, date, at: Date.now() });
  return !(cur && !cur.del);
};
export const checkin = (date, fields) => store.put('checkins', { ...(S().checkins[date] || { id: date, date }), ...fields, at: Date.now() });
export const park = text => store.put('parked', { id: uid('p'), text, at: Date.now() });
export const logFocus = (rec) => store.put('focus', { id: uid('f'), ...rec });
export const getFocus = () => store.prefs()['x.focus'] || null;
export const setFocus = f => store.setPref('x.focus', f);
export const recoveryDays = async (from, n, factor, p) => {
  const ops = [];
  for (let i = 0; i < n; i++) { const d = addDays(from, i), c = d === p.today ? p.cap(d) + p.doneToday : p.cap(d); ops.push({ c: 'prefs', rec: { id: 'x.cap.' + d, v: Math.round(c * factor) } }); }
  await store.write(ops);
};
