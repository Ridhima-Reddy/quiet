import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeStates, fingerprint } from '../../src/core/merge.js';
import { emptyState, calReason, makeItem } from '../../src/core/model.js';
import { offlineExtract, findDate, findTime, toItems } from '../../src/core/extract.js';
import { eventBody, eventIdFor } from '../../src/google/gcal.js';
import { dueNudge } from '../../src/core/nudges.js';
import { DEFAULT_PREFS } from '../../src/core/model.js';

test('merge keeps the newest version of each record and respects deletes', () => {
  const a = emptyState(), b = emptyState();
  a.items.x = { id: 'x', title: 'old', u: 1 }; b.items.x = { id: 'x', title: 'new', u: 2 };
  a.items.y = { id: 'y', title: 'only on laptop', u: 5 }; b.items.z = { id: 'z', title: 'only on phone', u: 5 };
  a.items.w = { id: 'w', title: 'w', u: 3 }; b.items.w = { id: 'w', del: true, u: 4 };
  const m = mergeStates(a, b);
  assert.equal(m.items.x.title, 'new'); assert.ok(m.items.y && m.items.z); assert.equal(m.items.w.del, true);
  assert.equal(fingerprint(mergeStates(a, b)), fingerprint(mergeStates(b, a)), 'order independent');
});

test('dates and times in brain dumps', () => {
  const T = '2026-11-11'; // Wednesday
  assert.equal(findDate('submit by friday', T), '2026-11-13');
  assert.equal(findDate('meeting next monday', T), '2026-11-16');
  assert.equal(findDate('due tomorrow', T), '2026-11-12');
  assert.equal(findDate('apply by 15 dec', T), '2026-12-15');
  assert.equal(findDate('fees by 12/11', T), '2026-11-12');
  assert.equal(findDate('report in 2 weeks', T), '2026-11-25');
  assert.equal(findDate('call tom about the fest', T), null);
  assert.equal(findTime('call at 6pm'), '18:00');
  assert.equal(findTime('class 9:30 am'), '09:30');
  assert.equal(findTime('meet at 14:00'), '14:00');
});

test('offline brain dump sorting', () => {
  const T = '2026-11-11';
  const r = offlineExtract(`Submit SOP for MIT by 15 dec
DSA exam on friday at 10am
call mom tomorrow 6pm
I'm worried about placements
gym 3 times a week
reply to Prof Rao's email`, [{ id: 'g1', name: 'Get into a good masters program' }], T);
  const by = t => r.items.find(i => i.title.toLowerCase().includes(t));
  assert.equal(by('sop').hard, true); assert.equal(by('sop').due, '2026-12-15');
  assert.equal(by('dsa exam').kind, 'event'); assert.equal(by('dsa exam').time, '10:00'); assert.equal(by('dsa exam').date, '2026-11-13');
  assert.ok(r.items.some(i => /prepare for/i.test(i.title) && i.due === '2026-11-13'), 'exam prep task');
  assert.equal(by('call mom').dueTime, '18:00');
  assert.ok(by('reply').effort <= 15, 'a reply is small');
  assert.equal(r.concerns.length, 1); assert.equal(r.habits.length, 1); assert.equal(r.habits[0].perWeek, 3);
  const r2 = offlineExtract('submit SOP for ETH by 21/11\nread the transformer paper', [], T);
  assert.equal(r2.items[0].title, 'Submit SOP for ETH', 'numeric dates are removed from titles');
  assert.equal(r2.items[0].due, '2026-11-21');
  assert.ok(r2.items[1].effort <= 90, 'reading a paper is not a 4-hour task');
  const items = toItems(r, []);
  const prep = items.find(i => /prepare/i.test(i.title)), ev = items.find(i => i.kind === 'event');
  assert.equal(prep.prepFor, ev.id);
});

test('what goes to Google Calendar', () => {
  assert.equal(calReason(makeItem({ title: 'DSA exam', kind: 'event', date: '2026-11-13' })), 'event');
  assert.equal(calReason(makeItem({ title: 'Submit SOP', due: '2026-12-15', hard: true })), 'deadline');
  assert.equal(calReason(makeItem({ title: 'Call mom', due: '2026-11-12', dueTime: '18:00' })), 'timed');
  assert.equal(calReason(makeItem({ title: 'Do laundry', due: '2026-11-12' })), null, 'flexible work stays on the list');
  assert.equal(calReason(makeItem({ title: 'Read', effort: 60 })), null);
  const b = eventBody(makeItem({ title: 'Submit SOP', due: '2026-12-15', hard: true }), 'deadline');
  assert.equal(b.start.date, '2026-12-15'); assert.equal(b.end.date, '2026-12-16'); assert.equal(b.transparency, 'transparent');
  assert.match(eventIdFor('i8x2k9abc'), /^[0-9a-v]{5,}$/);
});

test('nudges stay quiet in focus mode and at night', () => {
  const s = emptyState();
  const prefs = { ...DEFAULT_PREFS, 'x.focus': { end: Date.now() + 600e3, kind: 'focus' } };
  assert.equal(dueNudge(s, prefs, { lastNudge: {} }, new Date()), null);
  const night = new Date(); night.setHours(2, 0, 0, 0);
  assert.equal(dueNudge(s, DEFAULT_PREFS, { lastNudge: {} }, night), null);
  const mid = new Date(); mid.setHours(15, 0, 0, 0);
  const n = dueNudge(s, DEFAULT_PREFS, { lastNudge: { brief: mid.toISOString().slice(0, 10), any: 0, water: mid - 120 * 60e3 } }, mid);
  assert.ok(n && ['water', 'eyes', 'move', 'brief'].includes(n.type));
});
