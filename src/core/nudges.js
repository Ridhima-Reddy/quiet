// Decides whether a gentle nudge is due right now. Called once a minute by whichever surface shows
// the companion (extension background, desktop widget, or the open app on a phone).
import { NUDGES, COMPANIONS } from './model.js';
import { todayISO, toMin, nowMin, fmtMin, relDay, addDays } from './dates.js';
import { plan, dayLoad } from './planner.js';

const inWindow = (n, a, b) => a <= b ? n >= a && n < b : n >= a || n < b; // handles windows across midnight
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

export function focusState(prefs, now = Date.now()) {
  const f = prefs['x.focus'];
  if (!f || !f.end) return null;
  return { ...f, active: now < f.end && !f.paused, left: Math.max(0, f.end - now) };
}

export function inMeeting(state, now = new Date()) {
  const d = todayISO(now), n = nowMin(now);
  const evs = [...(state.gcal?.events || []), ...Object.values(state.items).filter(i => i && !i.del && i.kind === 'event').map(i => ({ date: i.date, time: i.time, endTime: i.endTime, transparent: false }))];
  return evs.some(e => e.date === d && e.time && !e.transparent && n >= toMin(e.time) && n < (e.endTime ? toMin(e.endTime) : toMin(e.time) + 60));
}

/** Returns {type, title, text, buttons} or null. Pure apart from reading `now`. */
export function dueNudge(state, prefs, local, now = new Date()) {
  if (local.nudgesHere === false) return null;
  const N = prefs.nudges, n = nowMin(now), today = todayISO(now), last = local.lastNudge || {};
  const f = focusState(prefs, now.getTime());
  if (f?.active) return null;
  if (f && !f.notified && now.getTime() >= f.end) return { type: 'focus-end', title: f.kind === 'break' ? 'Break over' : 'Focus done', text: f.kind === 'break' ? 'Ready for another round? Or call it here — both are fine.' : `Nice work${f.title ? ` on “${f.title}”` : ''}. Take a 5 minute break: stand, stretch, water.`, buttons: f.kind === 'break' ? ['Start focus', 'Done for now'] : ['Start break', 'Skip'] };
  if (inWindow(n, toMin(N.quietStart), toMin(N.quietEnd))) return null;
  if (now.getTime() - (last.any || 0) < 12 * 60e3) return null; // never two nudges within 12 minutes
  const meeting = N.pauseInMeetings && inMeeting(state, now);
  const comp = COMPANIONS.find(c => c.id === prefs.companion)?.name || 'Moss';

  // Once a day: a short morning briefing at the first nudge check after your day starts.
  const ds = toMin(prefs.dayStart);
  if (n >= ds && n < ds + 240 && last.brief !== today && !meeting) {
    try {
      const p = plan(state, prefs, { now }), ld = dayLoad(p, today);
      const evs = (p.busy[today]?.events || []).filter(e => !e.allDay || e.busy);
      const tasks = (p.byDay[today] || []).filter(s => !s.done);
      const dueSoon = Object.values(state.items).filter(i => i && !i.del && i.status !== 'done' && i.hard && i.due && i.due >= today && i.due <= addDays(today, 2));
      const bits = [];
      if (evs.length) bits.push(`${evs.length} event${evs.length > 1 ? 's' : ''}${evs[0].time ? ` (first at ${evs[0].time})` : ''}`);
      if (tasks.length) bits.push(`${tasks.length} task${tasks.length > 1 ? 's' : ''} · ${fmtMin(tasks.reduce((a, s) => a + s.minutes, 0))}`);
      const due = dueSoon.length ? ` ${dueSoon[0].title} is due ${relDay(dueSoon[0].due, today).toLowerCase()}.` : '';
      return { type: 'brief', title: `Good morning${prefs.name ? ', ' + prefs.name : ''}`, text: bits.length ? `Today: ${bits.join(', ')}. ${ld.label === 'Light' ? 'A gentle day.' : ld.label === 'Over' ? 'It\'s a lot — I can help you trim it.' : 'Let\'s take it one thing at a time.'}${due}` : `Nothing planned yet. A calm day — or dump what's on your mind and I'll sort it.${due}`, buttons: ['Open today', 'Thanks'] };
    } catch { /* fall through */ }
  }
  if (meeting) return null;
  // Meals and wind-down at their time (once a day, within 90 minutes of the time)
  const timed = [['lunch', N.meals && N.lunch], ['dinner', N.meals && N.dinner], ['winddown', N.winddown && (() => { const b = toMin(prefs.bedtime) - 30; return `${String(Math.floor(((b + 1440) % 1440) / 60)).padStart(2, '0')}:${String(((b + 1440) % 1440) % 60).padStart(2, '0')}`; })()]];
  for (const [type, t] of timed) {
    if (!t) continue; const tm = toMin(t);
    if (n >= tm && n < tm + 90 && last[type + 'Day'] !== today) return { type, dayKey: type + 'Day', title: NUDGES[type].title, text: pick(NUDGES[type].lines), buttons: ['Done', 'Later'] };
  }
  // Interval nudges (only during your day)
  if (!inWindow(n, ds, toMin(prefs.bedtime))) return null;
  let best = null, over = 0;
  for (const type of ['eyes', 'water', 'move']) {
    const every = +N[type]; if (!every) continue;
    const since = last[type] ? (now.getTime() - last[type]) / 60e3 : every * 0.6; // first one comes a little after you start
    if (since >= every && since / every > over) { over = since / every; best = type; }
  }
  if (!best) return null;
  return { type: best, title: NUDGES[best].title, text: pick(NUDGES[best].lines), buttons: ['Done', 'Later'], from: comp };
}

/** Record that a nudge was shown. Snoozed ones ("Later") come back in about 10-15 minutes. */
export function markShown(local, nudge, prefs, { snooze = false } = {}) {
  const t = Date.now(), last = { ...(local.lastNudge || {}), any: t };
  if (nudge.type === 'brief') last.brief = todayISO();
  if (nudge.dayKey) { if (!snooze) last[nudge.dayKey] = todayISO(); return last; }
  const every = +prefs.nudges?.[nudge.type] || 0;
  last[nudge.type] = snooze && every ? t - Math.max(0, every - 12) * 60e3 : t;
  return last;
}
