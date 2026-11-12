// Sync against an in-memory fake of Google Drive (appDataFolder) + Google Calendar.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../../src/core/store.js';
import { makeItem, emptyState } from '../../src/core/model.js';
import { syncNow } from '../../src/google/sync.js';
import { eventIdFor } from '../../src/google/gcal.js';
import { addDays, todayISO } from '../../src/core/dates.js';
import { deleteItem } from '../../src/core/actions.js';

const T = todayISO();
let G; // fake Google
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
function fakeGoogle() {
  G = { files: {}, events: {}, calls: [], failDriveRead: false, onPut: null, nextId: 1 };
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url), m = (opts.method || 'GET').toUpperCase(), body = opts.body;
    G.calls.push(`${m} ${u.pathname}`);
    if (u.pathname === '/drive/v3/files' && m === 'GET') return json({ files: Object.keys(G.files).map(id => ({ id })) });
    if (u.pathname.startsWith('/drive/v3/files/') && m === 'GET') { if (G.failDriveRead) return json({ error: 'boom' }, 503); return new Response(G.files[u.pathname.split('/').pop()]); }
    if (u.pathname === '/upload/drive/v3/files' && m === 'POST') { const id = 'f' + G.nextId++; G.files[id] = body.split('\r\n\r\n')[2].split('\r\n--')[0]; return json({ id }); }
    if (u.pathname.startsWith('/upload/drive/v3/files/') && m === 'PATCH') { G.files[u.pathname.split('/').pop()] = body; return json({}); }
    const ev = u.pathname.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/);
    if (ev) {
      const id = ev[2] && decodeURIComponent(ev[2]);
      if (m === 'GET' && !id) return json({ items: Object.values(G.events) });
      if (m === 'POST') { const b = JSON.parse(body); if (G.events[b.id] ) return json({ error: { message: 'dup' } }, 409); G.events[b.id] = { ...b, status: 'confirmed', updated: new Date().toISOString(), htmlLink: 'https://cal/' + b.id }; return json(G.events[b.id]); }
      if (m === 'PUT') { if (G.onPut) await G.onPut(id); if (!G.events[id]) return json({}, 404); if (G.events[id].status === 'cancelled' && JSON.parse(body).status !== 'confirmed') return json({}, 410); G.events[id] = { ...JSON.parse(body), id, status: 'confirmed', updated: new Date().toISOString() }; return json(G.events[id]); }
      if (m === 'DELETE') { if (!G.events[id]) return json({}, 404); G.events[id].status = 'cancelled'; return new Response(null, { status: 204 }); }
    }
    if (u.pathname.includes('calendarList')) return json({}, 403);
    return json({ error: 'unhandled ' + url }, 500);
  };
}
async function reset(items = []) {
  fakeGoogle();
  await store.init();
  const s = emptyState(); for (const it of items) s.items[it.id] = it;
  await store.replace(s);
  await store.setLocal({ google: { connected: true, token: 'tok', exp: Date.now() + 3600e3, email: 'me@x' }, syncError: '' });
}
const put = (it) => store.put('items', it);

test('first sync creates the Drive file and adds only events + hard deadlines to Calendar', async () => {
  const ev = makeItem({ title: 'DSA midsem', kind: 'event', date: addDays(T, 3), time: '10:00' });
  const dl = makeItem({ title: 'Submit SOP', due: addDays(T, 5), hard: true, effort: 240 });
  const flex = makeItem({ title: 'Do laundry', due: addDays(T, 2), effort: 40 });
  await reset([ev, dl, flex]);
  const r = await syncNow(); assert.equal(r.ok, true, JSON.stringify(r) + store.local.syncError);
  assert.equal(Object.keys(G.files).length, 1);
  assert.ok(G.events[eventIdFor(ev.id)], 'exam event created'); assert.ok(G.events[eventIdFor(dl.id)], 'deadline created');
  assert.ok(!G.events[eventIdFor(flex.id)], 'flexible task stays off the calendar');
  assert.equal(G.events[eventIdFor(dl.id)].start.date, dl.due);
  assert.equal(store.state.items[ev.id].gcal.own, true);
  // second sync: nothing changed -> no calendar writes
  G.calls = []; await syncNow();
  assert.ok(!G.calls.some(c => /^(POST|PUT) \/calendar/.test(c)), G.calls.join('\n'));
});

test('an edit made while sync is talking to Google is not overwritten', async () => {
  const ev = makeItem({ title: 'Meeting', kind: 'event', date: addDays(T, 2), time: '15:00' });
  await reset([ev]); await syncNow();
  await store.patch('items', ev.id, { title: 'Meeting with advisor' });
  G.onPut = async () => { G.onPut = null; await store.patch('items', ev.id, { location: 'Room 204' }); };
  await syncNow();
  const it = store.state.items[ev.id];
  assert.equal(it.title, 'Meeting with advisor'); assert.equal(it.location, 'Room 204', 'mid-sync edit survives');
  G.calls = []; await syncNow();
  assert.ok(G.calls.some(c => c.startsWith('PUT /calendar')), 'the mid-sync edit is pushed next time');
});

test('an event you delete in Google Calendar is not brought back', async () => {
  const ev = makeItem({ title: 'Club meeting', kind: 'event', date: addDays(T, 4), time: '18:00' });
  await reset([ev]); await syncNow();
  G.events[eventIdFor(ev.id)].status = 'cancelled';
  await syncNow();
  assert.equal(store.state.items[ev.id].cal, false);
  await store.patch('items', ev.id, { title: 'Club meeting (moved)' });
  await syncNow();
  assert.equal(G.events[eventIdFor(ev.id)].status, 'cancelled', 'stays deleted');
});

test('a failed Drive read stops the sync instead of overwriting your data', async () => {
  await reset([makeItem({ title: 'x' })]); await syncNow();
  const before = Object.values(G.files)[0];
  G.failDriveRead = true; await store.put('items', makeItem({ title: 'y' }));
  const r = await syncNow();
  assert.equal(r.ok, false); assert.equal(Object.values(G.files)[0], before, 'remote untouched');
});

test('deleting on a device that never saw the calendar link still removes the event', async () => {
  const ev = makeItem({ title: 'Interview', kind: 'event', date: addDays(T, 6), time: '11:00' });
  await reset([ev]); await syncNow();
  assert.equal(G.events[eventIdFor(ev.id)].status, 'confirmed');
  // phone: stale copy without gcal, deleted there -> tombstone without gcal lands in Drive
  const fid = Object.keys(G.files)[0], remote = JSON.parse(G.files[fid]);
  remote.items[ev.id] = { id: ev.id, del: true, u: Date.now() + 1000 }; G.files[fid] = JSON.stringify(remote);
  await syncNow();
  assert.equal(G.events[eventIdFor(ev.id)].status, 'cancelled');
});

test('deleting an item in Quiet removes its Google event', async () => {
  const dl = makeItem({ title: 'Pay fees', due: addDays(T, 2), hard: true, effort: 15 });
  await reset([dl]); await syncNow();
  await deleteItem(dl.id); await syncNow();
  assert.equal(G.events[eventIdFor(dl.id)].status, 'cancelled');
});
