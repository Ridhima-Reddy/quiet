// The assistant layer: notices heavy stretches, low energy, late nights and good days,
// picks what to start with, and builds the weekly summary. Pure functions over state + plan.
import { addDays, todayISO, toMin, nowMin, iso, mondayOf, range, DOW, fmtMin, partOfDay } from './dates.js';
import { SMALL_TASK } from './model.js';
import { dayLoad } from './planner.js';

const pickOne = (arr, seed) => arr[Math.abs(seed) % arr.length];
const seedOf = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
const live = o => Object.values(o || {}).filter(r => r && !r.del);
const dateOfTs = ts => iso(new Date(ts));

/** Everything that happened (or was planned) on a day. */
export function dayStats(state, p, d) {
  const sess = live(state.sessions).filter(s => s.date === d && state.items[s.itemId] && !state.items[s.itemId].del);
  const doneSess = live(state.sessions).filter(s => s.done && s.doneAt && dateOfTs(s.doneAt) === d);
  const plannedMin = sess.reduce((a, s) => a + s.minutes, 0);
  const doneMin = doneSess.reduce((a, s) => a + s.minutes, 0);
  const doneItems = live(state.items).filter(it => it.status === 'done' && it.doneAt && dateOfTs(it.doneAt) === d);
  const sessItems = new Set(doneSess.map(s => s.itemId));
  const doneCount = doneSess.length + doneItems.filter(i => !sessItems.has(i.id)).length;
  const eventsMin = p?.busy?.[d]?.min || 0;
  const late = doneSess.some(s => { const h = new Date(s.doneAt).getHours(); return h >= 0 && h < 4 || (h === 23 && new Date(s.doneAt).getMinutes() >= 30); });
  const focusMin = live(state.focus).filter(f => f.start && dateOfTs(f.start) === d).reduce((a, f) => a + (f.minutes || 0), 0);
  return { d, plannedMin, doneMin, doneCount: Math.max(0, doneCount), eventsMin, late, focusMin, checkin: state.checkins[d] && !state.checkins[d].del ? state.checkins[d] : null };
}

export function isHeavy(st, prefs) {
  const base = (+prefs.focusHours || 4) * 60;
  if (st.checkin?.feel === 'heavy') return true;
  if (st.checkin?.feel === 'light') return false;
  const total = st.eventsMin + Math.max(st.plannedMin, st.doneMin);
  return total >= Math.max(base + 150, 390) || (st.checkin?.energy === 1 && total >= 180);
}

export function recentPattern(state, prefs, p, today = todayISO()) {
  const days = range(addDays(today, -6), today).map(d => dayStats(state, p, d));
  const heavy = days.map(s => isHeavy(s, prefs));
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) { if (heavy[i]) streak++; else if (i === days.length - 1) continue; else break; }
  const heavy7 = heavy.filter(Boolean).length, late7 = days.filter(s => s.late).length;
  const done7 = days.reduce((a, s) => a + s.doneCount, 0), focus7 = days.reduce((a, s) => a + s.focusMin + s.doneMin, 0);
  const energies = days.map(s => s.checkin?.energy).filter(Boolean);
  const avgEnergy = energies.length ? energies.reduce((a, b) => a + b, 0) / energies.length : null;
  return { days, heavy, streak, heavy7, late7, done7, focus7, avgEnergy, today: days[days.length - 1] };
}

/** Cards the Today screen may show, most important first. Each has a stable id (dismissable per day). */
export function assistantCards(state, prefs, p, { now = new Date(), dismissed = {} } = {}) {
  const today = p.today, pat = recentPattern(state, prefs, p, today), name = prefs.name ? `, ${prefs.name.split(' ')[0]}` : '';
  const ld = dayLoad(p, today), tl = dayLoad(p, addDays(today, 1)), cards = [], seed = seedOf(today);
  const ci = state.checkins[today] && !state.checkins[today].del ? state.checkins[today] : null;
  const hour = now.getHours();
  const add = c => { if (dismissed[c.id] !== today) cards.push(c); };

  if (pat.streak >= 3 || pat.heavy7 >= 4) {
    add({ id: 'heavy', tone: 'care', title: pickOne([`It's been a heavy stretch${name}.`, `You've been carrying a lot${name}.`, `That's a lot of full days in a row${name}.`], seed),
      body: `${pat.heavy7} of the last 7 days were full${pat.done7 ? `, and you still finished ${pat.done7} thing${pat.done7 === 1 ? '' : 's'}` : ''}. You're doing better than it feels. ${tl.ratio > 0.6 ? 'Want me to make tomorrow lighter?' : 'Tomorrow is already lighter — protect that.'}`,
      actions: tl.ratio > 0.6 ? [{ id: 'lighten-tomorrow', label: 'Lighten tomorrow' }, { id: 'recovery', label: 'Easier next 3 days' }] : [{ id: 'dismiss', label: 'Thanks' }] });
  }
  if (ci?.energy === 1 && ld.ratio > 0.5) add({ id: 'lowenergy', tone: 'care', title: 'Low battery day.', body: 'Do the one thing that matters and let the rest move. I can shift what isn\'t urgent.', actions: [{ id: 'lighten-today', label: 'Trim today' }] });
  if (ld.ratio > 1.05 && hour < 20) add({ id: 'over', tone: 'warn', title: 'Today is over-full.', body: `About ${fmtMin(ld.planned)} of work for ${fmtMin(ld.cap)} of room. Shall I move what can wait?`, actions: [{ id: 'lighten-today', label: 'Free up today' }] });
  if (pat.late7 >= 3) add({ id: 'late', tone: 'care', title: 'Lots of late nights lately.', body: `You finished work after 11:30pm on ${pat.late7} nights this week. Sleep is part of the plan too — I'll nudge you to wind down at ${prefs.bedtime}.`, actions: [{ id: 'dismiss', label: 'Okay' }] });
  if (hour >= 18 && pat.today.doneCount >= 3 && !(p.byDay[today] || []).some(s => !s.done)) add({ id: 'cleared', tone: 'joy', title: pickOne(['Everything done today.', 'You cleared the list.', 'Today: complete.'], seed), body: `${pat.today.doneCount} things finished. Rest is earned — close the laptop with a clear head.`, actions: [] });
  if (hour >= 19 && !ci?.feel) add({ id: 'feel', tone: 'ask', title: 'How did today feel?', body: 'One tap. It helps me notice heavy weeks before they pile up.', actions: [{ id: 'feel:light', label: 'Light' }, { id: 'feel:okay', label: 'Okay' }, { id: 'feel:heavy', label: 'Heavy' }] });
  return cards;
}

/** One short line for the companion bubble. */
export function companionLine(state, prefs, p, now = new Date()) {
  const pat = recentPattern(state, prefs, p, p.today), ld = dayLoad(p, p.today), part = partOfDay(now), n = prefs.name ? prefs.name.split(' ')[0] : '';
  const seed = seedOf(p.today + now.getHours());
  if (pat.streak >= 3) return pickOne([`Heavy week${n ? ', ' + n : ''}. Be gentle with yourself today.`, 'You keep showing up. That counts for a lot.', 'One thing at a time. That\'s all today needs.'], seed);
  if (part === 'night') return pickOne(['It\'s late. The list will still be here tomorrow.', 'Time to rest. You did enough today.'], seed);
  if (ld.left === 0 && ld.planned > 0) return pickOne(['All done for today. Proud of you.', 'List cleared. Go do something nice.'], seed);
  if (part === 'morning') return pickOne([`Morning${n ? ', ' + n : ''}. ${ld.label === 'Light' ? 'A light day — nice.' : 'Let\'s start with something small.'}`, 'Good morning. Water first, then one small thing.'], seed);
  return pickOne(['You\'re doing better than you think.', 'Small steps still move you forward.', 'Remember to drink some water.', 'I\'m here if you need to dump your thoughts.'], seed);
}

/** Decision-fatigue support: the one thing to start with now, and why. */
export function pickNext(state, prefs, p, { energy = null, now = new Date(), skip = [] } = {}) {
  const today = p.today, items = state.items, nm = nowMin(now);
  const list = (p.byDay[today] || []).filter(s => !s.done && items[s.itemId] && !skip.includes(s.id));
  if (!list.length) return null;
  const nextEvent = (p.busy[today]?.events || []).find(e => e.time && toMin(e.time) > nm);
  const gap = nextEvent ? toMin(nextEvent.time) - nm : null;
  const lateDay = now.getHours() >= 19, morning = now.getHours() < 12;
  const scored = list.map(s => {
    const it = items[s.itemId], reasons = []; let sc = 0;
    if (it.due && it.due <= today) { sc += 4; reasons.push(it.due < today ? 'overdue' : 'due today'); }
    else if (it.due === addDays(today, 1)) { sc += 3; reasons.push('due tomorrow'); }
    else if (it.due && it.hard) { sc += 1; }
    if (s.risk) { sc += 2; reasons.push('tight deadline'); }
    const load = it.load || 'medium';
    if (energy === 1 || lateDay) { sc += load === 'light' ? 2 : load === 'deep' ? -2 : 0; sc -= s.minutes / 90; if (load === 'light') reasons.push(energy === 1 ? 'gentle for low energy' : 'easy evening task'); }
    else if (energy === 4 || (morning && energy !== 2)) { sc += load === 'deep' ? 2 : 0; if (load === 'deep') reasons.push('best done with a fresh mind'); }
    if (gap != null && gap < 90) { if (s.minutes <= gap) { sc += 1.5; reasons.push(`fits before ${nextEvent.title}`); } else sc -= 1; }
    if ((it.goals || []).length) { sc += 0.75; }
    if (it.steps?.chunks?.some(c => c.steps.some(x => x.done))) { sc += 1; reasons.push('you already started'); }
    if (s.minutes <= 15) sc += 0.5;
    return { s, it, sc, reasons };
  }).sort((a, b) => b.sc - a.sc);
  const top = scored[0];
  return { session: top.s, item: top.it, reason: top.reasons.slice(0, 2).join(' · ') || (top.it.goals?.length ? 'moves you toward a goal' : 'a good place to start'), others: scored.slice(1).map(x => x.s) };
}

export const canChunk = it => it && it.kind === 'task' && it.effort >= SMALL_TASK;

/** Weekly summary numbers. */
export function weekSummary(state, prefs, p, weekStart = mondayOf(todayISO())) {
  const days = range(weekStart, addDays(weekStart, 6)).map(d => ({ ...dayStats(state, p, d), dow: DOW[new Date(d + 'T12:00').getDay()] }));
  const items = live(state.items), goals = live(state.goals);
  const wkEnd = addDays(weekStart, 6), inWeek = ts => ts && dateOfTs(ts) >= weekStart && dateOfTs(ts) <= wkEnd;
  const doneItems = items.filter(i => i.status === 'done' && inWeek(i.doneAt));
  const doneSess = live(state.sessions).filter(s => s.done && inWeek(s.doneAt));
  const minutesByItem = {};
  doneSess.forEach(s => { minutesByItem[s.itemId] = (minutesByItem[s.itemId] || 0) + s.minutes; });
  const perGoal = goals.map(g => {
    const its = items.filter(i => (i.goals || []).includes(g.id));
    const min = its.reduce((a, i) => a + (minutesByItem[i.id] || 0), 0);
    return { goal: g, minutes: min, done: its.filter(i => i.status === 'done' && inWeek(i.doneAt)).length };
  });
  const unaligned = Object.entries(minutesByItem).filter(([id]) => state.items[id] && !(state.items[id].goals || []).length).reduce((a, [, m]) => a + m, 0);
  const habits = live(state.habits).map(h => ({ h, count: live(state.habitLogs).filter(l => l.habitId === h.id && l.date >= weekStart && l.date <= wkEnd).length }));
  const reconsider = items.filter(i => i.status !== 'done' && i.kind === 'task' && !i.due && !(i.goals || []).length && Date.now() - (i.created || 0) > 6 * 864e5);
  const heavyDays = days.filter(d => isHeavy(d, prefs)).length;
  const energy = days.map(d => d.checkin?.energy || null);
  return {
    weekStart, days, doneCount: days.reduce((a, d) => a + d.doneCount, 0), doneItems,
    workMin: doneSess.reduce((a, s) => a + s.minutes, 0), focusMin: days.reduce((a, d) => a + d.focusMin, 0),
    perGoal, unalignedMin: unaligned, habits, reconsider, heavyDays, energy,
    lateNights: days.filter(d => d.late).length,
  };
}
