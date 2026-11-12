import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan, dayLoad } from '../../src/core/planner.js';
import { emptyState, makeItem, DEFAULT_PREFS } from '../../src/core/model.js';
import { addDays } from '../../src/core/dates.js';
import { canChunk } from '../../src/core/wellbeing.js';

// Wednesday 11 Nov 2026, 10:00
const NOW = new Date(2026, 10, 11, 10, 0), T = '2026-11-11';
const prefs = { ...DEFAULT_PREFS, focusHours: 4, dayStart: '09:00', dayEnd: '22:00' };
const st = () => emptyState();
const add = (s, x) => { const it = makeItem(x); s.items[it.id] = it; return it; };
const lock = (s, it, date, minutes) => { s.sessions[`${it.id}@${date}`] = { id: `${it.id}@${date}`, itemId: it.id, date, minutes, done: false, lock: true, u: 1 }; };
const daysOf = (p, it) => p.sessions.filter(x => x.itemId === it.id).map(x => x.date);

test('a busy today does not get a small task that is due later', () => {
  const s = st();
  for (let i = 0; i < 4; i++) { const a = add(s, { title: 'Busy ' + i, effort: 60, due: T }); lock(s, a, T, 60); }
  const small = add(s, { title: 'Email professor', effort: 15, due: addDays(T, 5) });
  const p = plan(s, prefs, { now: NOW });
  const d = daysOf(p, small);
  assert.equal(d.length, 1);
  assert.notEqual(d[0], T, 'should not land on the full day');
  assert.ok(d[0] >= addDays(T, 3) && d[0] <= addDays(T, 5), 'lands in the few days before it is due, got ' + d[0]);
});

test('a 15-minute task is one session and is never chunked', () => {
  const s = st(); const it = add(s, { title: 'Pay mess fee', effort: 15, due: addDays(T, 2), hard: true });
  const p = plan(s, prefs, { now: NOW });
  assert.equal(daysOf(p, it).length, 1);
  assert.equal(canChunk(it), false);
  assert.equal(canChunk(add(s, { title: 'Essay', effort: 240 })), true);
});

test('a big task is split across several days before its deadline', () => {
  const s = st(); const it = add(s, { title: 'Write SOP', effort: 360, load: 'deep', due: addDays(T, 8), hard: true });
  const p = plan(s, prefs, { now: NOW });
  const d = daysOf(p, it);
  assert.ok(d.length >= 3, 'split into several sessions, got ' + d.length);
  assert.equal(new Set(d).size, d.length, 'one session per day');
  assert.ok(d.every(x => x <= addDays(T, 7)), 'hard deadline keeps a buffer day');
  assert.equal(p.sessions.filter(x => x.itemId === it.id).reduce((a, x) => a + x.minutes, 0), 360);
});

test('undated tasks wait in Anytime', () => {
  const s = st(); const it = add(s, { title: 'Read Atomic Habits', effort: 60 });
  const p = plan(s, prefs, { now: NOW });
  assert.equal(daysOf(p, it).length, 0);
  assert.ok(p.anytime.some(x => x.id === it.id));
});

test('meetings reduce the room in a day', () => {
  const s = st();
  const day = addDays(T, 2);
  for (const t of ['09:00', '11:00', '13:00', '15:00', '17:00']) add(s, { title: 'Class ' + t, kind: 'event', date: day, time: t, endTime: t.replace(/^(\d+)/, h => String(+h + 2).padStart(2, '0')) });
  const p = plan(s, prefs, { now: NOW });
  assert.ok(p.cap(day) < 240, 'cap reduced on a day of classes: ' + p.cap(day));
  const it = add(s, { title: 'Problem set', effort: 90, due: addDays(T, 3) });
  const p2 = plan(s, prefs, { now: NOW });
  assert.notEqual(daysOf(p2, it)[0], day);
});

test('late in the evening, today takes nothing new that can wait', () => {
  const s = st(); const it = add(s, { title: 'Laundry', effort: 40, due: addDays(T, 3) });
  const p = plan(s, prefs, { now: new Date(2026, 10, 11, 21, 30) });
  assert.notEqual(daysOf(p, it)[0], T);
});

test('rest days stay empty', () => {
  const s = st(); const sunday = '2026-11-15';
  const it = add(s, { title: 'Reading', effort: 60, due: '2026-11-16' });
  const p = plan(s, { ...prefs, restDays: [0] }, { now: NOW });
  assert.ok(!daysOf(p, it).includes(sunday));
  assert.equal(dayLoad(p, sunday).label, 'Rest');
});

test('impossible deadlines are flagged as tight rather than hidden', () => {
  const s = st(); const it = add(s, { title: 'Huge report', effort: 900, due: addDays(T, 1), hard: true });
  const p = plan(s, prefs, { now: NOW });
  assert.ok(p.sessions.filter(x => x.itemId === it.id).some(x => x.risk));
});

test('exam prep is spread out before the exam', () => {
  const s = st(); const ex = add(s, { title: 'DSA exam', kind: 'event', date: addDays(T, 9), time: '10:00' });
  const prep = add(s, { title: 'Revise DSA', effort: 480, load: 'deep', due: ex.date, prepFor: ex.id });
  const p = plan(s, prefs, { now: NOW });
  const d = daysOf(p, prep).sort();
  assert.ok(d.length >= 5, 'several revision sessions: ' + d.length);
  assert.ok(d[d.length - 1] < ex.date, 'nothing on exam day');
});

test("today's list is sticky: a new urgent task does not push locked items off today", () => {
  const s = st(); const a = add(s, { title: 'A', effort: 120, due: addDays(T, 4) }); lock(s, a, T, 120);
  add(s, { title: 'Urgent', effort: 120, due: T, hard: true });
  const p = plan(s, prefs, { now: NOW });
  assert.ok(p.byDay[T].some(x => x.itemId === a.id));
});
