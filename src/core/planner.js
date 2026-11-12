// The planner. Deterministic and explainable:
//  1. Fixed things first: events (Quiet + Google Calendar) eat into each day's capacity.
//  2. Capacity per day = your focus hours, minus meetings/classes, minus what's left of today,
//     scaled by today's energy, rest days and any "lighten this day" override.
//  3. Today's list is sticky: once something is on today it stays (until you move or finish it).
//  4. Tasks are placed most-urgent first. Small tasks get one session in a short window just
//     before the due date, on the least-loaded day. Only big tasks (2h+) are split and spread
//     across several days. Nothing lands on a full day unless a deadline forces it (flagged "tight").
//  5. Undated tasks are never auto-scheduled; they wait in Anytime until you pull them in.
import { addDays, todayISO, toMin, nowMin, daysBetween, dow, range } from './dates.js';
import { SPLIT_TASK } from './model.js';

export const sid = (itemId, date) => `${itemId}@${date}`;

const CHUNK = { light: 60, medium: 75, deep: 90 };
const ENERGY = { 1: 0.6, 2: 0.85, 3: 1, 4: 1.1 };

/** Busy time per day from Quiet events and cached Google Calendar events. */
export function busyMap(state, prefs, from, to) {
  const out = {}, ds = toMin(prefs.dayStart), de = toMin(prefs.dayEnd), work = Math.max(60, de - ds);
  const add = (d, ev) => { if (d < from || d > to) return; (out[d] = out[d] || { min: 0, events: [] }); out[d].events.push(ev); out[d].min += ev.busy; };
  const timedBusy = (t, e, dur) => { const s = toMin(t), en = e ? toMin(e) : s + (dur || 60); return Math.max(0, Math.min(en, de) - Math.max(s, ds)); };
  for (const it of Object.values(state.items)) {
    if (!it || it.del || it.kind !== 'event' || !it.date) continue;
    const end = it.endDate && it.endDate > it.date ? it.endDate : it.date;
    for (const d of range(it.date, end > addDays(it.date, 30) ? addDays(it.date, 30) : end)) {
      const busy = it.time ? timedBusy(it.time, it.endTime, 60) : end > it.date ? Math.round(work * 0.6) : 120;
      add(d, { src: 'quiet', id: it.id, title: it.title, time: it.time, endTime: it.endTime, allDay: !it.time, busy, item: it });
    }
  }
  if (prefs.gcalPull !== false) {
    const cals = new Set(prefs.gcalReadCalendars || ['primary']);
    for (const ev of state.gcal?.events || []) {
      if (ev.quietId && state.items[ev.quietId] && !state.items[ev.quietId].del) continue; // already shown as the Quiet item
      if (ev.calId && !cals.has(ev.calId) && !(ev.calId === 'primary' && cals.has('primary'))) continue;
      const end = ev.endDate && ev.endDate > ev.date ? ev.endDate : ev.date;
      for (const d of range(ev.date, end > addDays(ev.date, 30) ? addDays(ev.date, 30) : end)) {
        const busy = ev.transparent ? 0 : ev.allDay ? Math.round(work * 0.5) : timedBusy(d === ev.date ? ev.time : prefs.dayStart, d === end ? ev.endTime : prefs.dayEnd, 60);
        add(d, { src: 'gcal', id: ev.id, title: ev.title, time: d === ev.date ? ev.time : null, endTime: d === end ? ev.endTime : null, allDay: ev.allDay, busy, link: ev.link, location: ev.location });
      }
    }
  }
  for (const d of Object.keys(out)) out[d].events.sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
  return out;
}

export function capacityFn(state, prefs, busy, { now = new Date(), energy = null } = {}) {
  const today = todayISO(now), ds = toMin(prefs.dayStart), de = toMin(prefs.dayEnd), work = Math.max(60, de - ds);
  const base = Math.round((+prefs.focusHours || 4) * 60), rest = new Set(prefs.restDays || []);
  const overrides = {};
  for (const r of Object.values(state.prefs)) if (r && !r.del && r.id.startsWith('x.cap.')) overrides[r.id.slice(6)] = r.v;
  return d => {
    if (d < today) return 0;
    if (rest.has(dow(d))) return 0;
    const b = busy[d]?.min || 0;
    let cap = Math.min(base, Math.max(0, work - b - 60));
    if (d === today) {
      const n = nowMin(now), startFrom = Math.max(n, ds);
      const busyLeft = (busy[d]?.events || []).reduce((a, e) => a + (e.time ? Math.max(0, Math.min(e.endTime ? toMin(e.endTime) : toMin(e.time) + 60, de) - Math.max(toMin(e.time), startFrom)) : 0), 0);
      cap = Math.min(cap, Math.max(0, Math.round((de - startFrom - busyLeft) * 0.85)));
      if (energy) cap = Math.round(cap * (ENERGY[energy] || 1));
    }
    if (overrides[d] != null) cap = Math.min(cap, overrides[d]);
    return Math.max(0, cap);
  };
}

/** Compute the full plan. Returns derived sessions (not persisted) merged with persisted ones. */
export function plan(state, prefs, { now = new Date(), energy = null } = {}) {
  const today = todayISO(now), horizon = addDays(today, 120);
  const items = state.items, busy = busyMap(state, prefs, addDays(today, -14), horizon);
  const rawCap = capacityFn(state, prefs, busy, { now, energy });
  const used = {}, addUse = (d, m) => { used[d] = (used[d] || 0) + m; };
  const persisted = Object.values(state.sessions).filter(s => s && !s.del && items[s.itemId] && !items[s.itemId].del);
  // Today's capacity is "time left today", so work already finished today is subtracted from the
  // daily budget instead of being counted twice.
  const doneToday = persisted.filter(s => s.done && s.date === today).reduce((a, s) => a + s.minutes, 0);
  const base = Math.round((+prefs.focusHours || 4) * 60);
  const cap = d => d === today ? Math.min(rawCap(d), Math.max(0, base - doneToday)) : rawCap(d);
  const fixed = [], missedBy = {};
  for (const s of persisted) {
    if (s.done) { fixed.push(s); continue; } // finished work frees its day (today is handled via doneToday)
    if (s.date < today) { (missedBy[s.itemId] = missedBy[s.itemId] || []).push(s); continue; }
    if (items[s.itemId].status === 'done') continue;
    fixed.push(s); addUse(s.date, s.minutes);
  }
  const byItem = {};
  for (const s of fixed) (byItem[s.itemId] = byItem[s.itemId] || []).push(s);

  const open = Object.values(items).filter(it => it && !it.del && it.kind === 'task' && it.status !== 'done');
  const work = [];
  for (const it of open) {
    const ss = byItem[it.id] || [];
    const doneMin = ss.filter(s => s.done).reduce((a, s) => a + s.minutes, 0);
    const fixedMin = ss.filter(s => !s.done).reduce((a, s) => a + s.minutes, 0);
    const remaining = it.effort - doneMin - fixedMin;
    if (!it.due || remaining < 5) continue;
    if (ss.length && ss.some(s => !s.done) && remaining < Math.min(15, it.effort * 0.25)) continue;
    let L = it.due;
    if ((it.hard || it.prepFor) && it.due > today) L = addDays(it.due, -1);
    if (L < today) L = today;
    work.push({ it, remaining, L, taken: new Set(ss.map(s => s.date)) });
  }
  const goalCount = it => (it.goals || []).length;
  work.sort((a, b) => a.L.localeCompare(b.L) || (b.it.hard - a.it.hard) || (b.remaining - a.remaining) || (goalCount(b.it) - goalCount(a.it)) || (a.it.created - b.it.created));

  const derived = [];
  const ratio = (d, m) => { const c = cap(d); return c <= 0 ? Infinity : ((used[d] || 0) + m) / c; };
  const fits = (d, m) => cap(d) > 0 && (used[d] || 0) + m <= cap(d) + 5;

  for (const w of work) {
    const { it, L, taken } = w;
    const big = it.effort >= SPLIT_TASK;
    let n = big ? Math.max(1, Math.ceil(w.remaining / CHUNK[it.load || 'medium'])) : 1;
    let lead = n === 1 ? 3 : Math.ceil(n * 1.6) + 1;
    if (it.prepFor) lead = Math.max(lead, n * 2 + 1);
    let E = addDays(L, -(lead - 1));
    if (E < today) E = today;
    if (it.start && it.start > E) E = it.start > L ? L : it.start;
    let win = range(E, L).filter(d => !taken.has(d));
    // Not enough distinct days before the deadline: use fewer, longer sessions.
    if (win.length < n) {
      const wider = range(today, L).filter(d => !taken.has(d) && cap(d) > 0);
      win = wider.length >= n ? wider.slice(-Math.max(n, win.length)) : wider;
      if (win.length < n) n = Math.max(1, win.length);
    }
    if (!win.length) win = [L];
    const each = Math.max(5, Math.round(w.remaining / n / 5) * 5);
    const chosen = new Set();
    for (let i = 0; i < n; i++) {
      const m = i === n - 1 ? Math.max(5, w.remaining - each * (n - 1)) : each;
      const seg = n === 1 ? win : win.slice(Math.floor(i * win.length / n), Math.max(Math.floor(i * win.length / n) + 1, Math.floor((i + 1) * win.length / n)));
      const free = ds => ds.filter(d => !chosen.has(d) && !taken.has(d));
      const best = ds => { let b = null, br = Infinity; for (const d of ds) { if (!fits(d, m)) continue; const r = ratio(d, m); if (r < br - 1e-9) { br = r; b = d; } } return b; };
      let day = best(free(seg)) || best(free(win));
      if (!day) { // try earlier days (closest to the window first)
        const earlier = range(today, addDays(win[0], -1)).filter(d => !chosen.has(d) && !taken.has(d)).reverse();
        for (const d of earlier) if (fits(d, m)) { day = d; break; }
      }
      let risk = false;
      if (!day) { // nothing fits: least-overloaded day in the window, flagged as tight
        let b = null, br = Infinity;
        for (const d of free(range(today, L))) { const r = cap(d) > 0 ? ratio(d, m) : 99 + daysBetween(d, L); if (r < br) { br = r; b = d; } }
        day = b || L; risk = true;
      }
      chosen.add(day); addUse(day, m);
      derived.push({ id: sid(it.id, day), itemId: it.id, date: day, minutes: m, done: false, derived: true, risk, carried: !!missedBy[it.id] || it.due < today });
    }
  }

  // Number the parts of each task (1/3, 2/3 ...)
  const all = [...fixed, ...derived];
  const parts = {};
  for (const s of all) (parts[s.itemId] = parts[s.itemId] || []).push(s);
  for (const list of Object.values(parts)) {
    list.sort((a, b) => a.date.localeCompare(b.date));
    list.forEach((s, i) => { s.n = i + 1; s.of = list.length; });
  }
  for (const s of all) if (missedBy[s.itemId] && !s.done) s.carried = true;

  const byDay = {};
  for (const s of all) (byDay[s.date] = byDay[s.date] || []).push(s);
  const anytime = open.filter(it => !it.due && !(byItem[it.id] || []).some(s => !s.done));
  return { today, sessions: all, byDay, used, cap, busy, anytime, missedBy, doneToday, toLock: derived.filter(s => s.date === today) };
}

/** Day summary for headers: planned work vs. what the day can hold. */
export function dayLoad(p, d) {
  const list = p.byDay[d] || [], planned = list.reduce((a, s) => a + s.minutes, 0), left = list.filter(s => !s.done).reduce((a, s) => a + s.minutes, 0);
  const c = d === p.today ? p.cap(d) + p.doneToday : p.cap(d), ev = p.busy[d]?.min || 0;
  const r = c > 0 ? planned / c : planned > 0 ? 2 : 0;
  const label = c === 0 && !planned ? (ev ? 'Busy' : 'Rest') : r < 0.4 ? 'Light' : r < 0.85 ? 'Balanced' : r <= 1.05 ? 'Full' : 'Over';
  return { cap: c, planned, left, events: ev, ratio: r, label };
}
