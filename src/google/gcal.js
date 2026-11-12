// Google Calendar sync.
// Push (Quiet -> Google): events, hard deadlines and timed reminders (see calReason in model.js),
//   with phone-friendly reminders. Event ids are derived from the Quiet id, so two devices can
//   never create the same event twice.
// Pull (Google -> Quiet): your events show on the plan and count as busy time. If you move a
//   Quiet-created event in Google Calendar, Quiet follows; if you delete it there, Quiet stops adding it.
import { store } from '../core/store.js';
import { addDays, todayISO, iso, pad, toMin, fromMin, pd } from '../core/dates.js';
import { calReason } from '../core/model.js';
import { gfetch } from './auth.js';
import { norm } from '../core/extract.js';

const API = 'https://www.googleapis.com/calendar/v3';
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; } };
const hex = s => [...s].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
export const eventIdFor = itemId => 'q0' + hex(itemId);
const EXAMY = /\b(exam|mid-?sem|end-?sem|midterm|final|quiz|test|viva|interview)\b/i;
const hashStr = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
// Time-zone names differ between browsers (Asia/Calcutta vs Asia/Kolkata): keep them out of the change hash.
const hashBody = b => hashStr(JSON.stringify(b, (k, v) => k === 'timeZone' ? undefined : v));
const okGone = r => r.ok || r.status === 404 || r.status === 410;

async function call(method, path, body) {
  const r = await gfetch(API + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const j = r.status === 204 ? {} : await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, j };
}

export function eventBody(it, reason) {
  const zone = tz(), desc = (it.notes ? it.notes + '\n\n' : '') + 'Added by Quiet', priv = { quietId: it.id, quietKind: reason };
  const timed = (date, time, mins) => { const end = toMin(time) + mins, endDate = end >= 1440 ? addDays(date, 1) : date; return { start: { dateTime: `${date}T${time}:00`, timeZone: zone }, end: { dateTime: `${endDate}T${fromMin(end % 1440)}:00`, timeZone: zone } }; };
  const allDay = (a, b = a) => ({ start: { date: a }, end: { date: addDays(b, 1) } });
  const done = it.status === 'done' ? '✓ ' : '';
  if (reason === 'event') {
    const endDate = it.endDate && it.endDate > it.date ? it.endDate : it.date, exam = EXAMY.test(it.title);
    let when;
    if (it.time) {
      let mins = it.endTime ? toMin(it.endTime) - toMin(it.time) : exam ? 180 : 60; if (mins <= 0) mins = 60;
      when = endDate > it.date && it.endTime ? { start: { dateTime: `${it.date}T${it.time}:00`, timeZone: zone }, end: { dateTime: `${endDate}T${it.endTime}:00`, timeZone: zone } } : timed(it.date, it.time, mins);
    } else when = allDay(it.date, endDate);
    const overrides = it.time ? (exam ? [{ method: 'popup', minutes: 1440 }, { method: 'popup', minutes: 60 }] : [{ method: 'popup', minutes: 30 }]) : [{ method: 'popup', minutes: 900 }];
    return { summary: it.title, location: it.location || undefined, description: desc, ...when, reminders: { useDefault: false, overrides }, extendedProperties: { private: priv } };
  }
  if (reason === 'timed') {
    return { summary: done + it.title, description: desc, ...timed(it.due, it.dueTime, Math.max(15, Math.min(it.effort || 15, 120))), reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] }, extendedProperties: { private: priv } };
  }
  // deadline / manual: a marker on the due date that does not block your free/busy time
  const when = it.dueTime ? timed(it.due, it.dueTime, 15) : allDay(it.due);
  const overrides = it.dueTime ? [{ method: 'popup', minutes: 60 }, { method: 'popup', minutes: 1440 }] : [{ method: 'popup', minutes: 900 }, { method: 'popup', minutes: 3780 }];
  return { summary: `${done}Due: ${it.title}`, description: desc, ...when, transparency: 'transparent', colorId: '6', reminders: { useDefault: false, overrides }, extendedProperties: { private: priv } };
}

function normalize(e, calId) {
  if (!e.start) return null;
  const allDay = !!e.start.date;
  let date, time = null, endDate, endTime = null;
  if (allDay) { date = e.start.date; endDate = e.end?.date ? addDays(e.end.date, -1) : date; }
  else { const s = new Date(e.start.dateTime), en = new Date(e.end?.dateTime || e.start.dateTime); date = iso(s); time = `${pad(s.getHours())}:${pad(s.getMinutes())}`; endDate = iso(en); endTime = `${pad(en.getHours())}:${pad(en.getMinutes())}`; }
  const declined = (e.attendees || []).some(a => a.self && a.responseStatus === 'declined');
  if (declined) return null;
  return { id: e.id, calId, title: e.summary || '(busy)', date, time, endDate, endTime, allDay, transparent: e.transparency === 'transparent', quietId: e.extendedProperties?.private?.quietId || null, link: e.htmlLink, location: e.location || '', updated: Date.parse(e.updated) || 0 };
}

export async function listCalendars() {
  const r = await call('GET', '/users/me/calendarList?minAccessRole=reader');
  if (!r.ok) return null; // scope not granted: primary only
  return (r.j.items || []).map(c => ({ id: c.primary ? 'primary' : c.id, name: c.summaryOverride || c.summary, color: c.backgroundColor, primary: !!c.primary }));
}

/** Returns { events, cancelled } — cancelled = ids of Quiet-created events you deleted in Google. */
export async function pullCalendar(prefs) {
  const today = todayISO(), from = new Date(pd(addDays(today, -14))).toISOString(), to = new Date(pd(addDays(today, 100))).toISOString();
  const cals = [...new Set([...(prefs.gcalReadCalendars || ['primary']), prefs.gcalCalendarId || 'primary'])];
  const events = [], cancelled = new Set();
  for (const cal of cals) {
    let page = '';
    for (let i = 0; i < 6; i++) {
      const q = new URLSearchParams({ timeMin: from, timeMax: to, singleEvents: 'true', showDeleted: 'true', maxResults: '500' }); if (page) q.set('pageToken', page);
      const r = await call('GET', `/calendars/${encodeURIComponent(cal)}/events?${q}`);
      if (!r.ok) { if (r.status === 404 || r.status === 403) break; throw new Error(r.j?.error?.message || 'Calendar read failed'); }
      for (const e of r.j.items || []) {
        if (e.status === 'cancelled') { if (/^q0[0-9a-f]+$/.test(e.id)) cancelled.add(e.id); continue; }
        const n = normalize(e, cal); if (n) events.push(n);
      }
      page = r.j.nextPageToken; if (!page) break;
    }
  }
  events.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  return { events, cancelled: [...cancelled] };
}

/** Follow changes made in Google Calendar to events Quiet created. */
export async function applyPulled({ events, cancelled = [] }) {
  const ops = [], items = store.state.items, gone = new Set(cancelled);
  for (const it of Object.values(items)) {
    if (!it || it.del || !it.gcal?.own || !gone.has(it.gcal.id)) continue;
    if (events.some(e => e.id === it.gcal.id)) continue;
    ops.push({ c: 'items', rec: { ...it, cal: false, gcal: null } }); // you deleted it in Google: respect that
  }
  for (const ev of events) {
    const it = ev.quietId && items[ev.quietId];
    if (!it || it.del || !it.gcal?.own || it.gcal.id !== ev.id) continue;
    // Only follow Google when its change is newer than both our last push and the last edit in Quiet.
    if (ev.updated <= Math.max(it.gcal.at || 0, it.u || 0) + 15000) continue;
    if (it.kind === 'event' && (ev.date !== it.date || (!ev.allDay && (ev.time !== it.time || ev.endTime !== it.endTime))))
      ops.push({ c: 'items', rec: { ...it, date: ev.date, time: ev.allDay ? null : ev.time, endTime: ev.allDay ? null : ev.endTime, endDate: ev.endDate !== ev.date ? ev.endDate : null, gcal: { ...it.gcal, at: ev.updated } } });
    else if (it.kind === 'task' && (ev.date !== it.due || (!ev.allDay && it.dueTime && ev.time !== it.dueTime)))
      ops.push({ c: 'items', rec: { ...it, due: ev.date, dueTime: ev.allDay ? null : ev.time, gcal: { ...it.gcal, at: ev.updated } } });
    else ops.push({ c: 'items', rec: { ...it, gcal: { ...it.gcal, at: ev.updated } }, soft: true }); // nothing to follow; remember we've seen it
  }
  if (ops.length) await store.write(ops, { dirty: false });
  return ops.length;
}

const similar = (a, b) => { const A = new Set(norm(a).split(' ').filter(w => w.length > 2)), B = new Set(norm(b).replace(/^due /, '').split(' ').filter(w => w.length > 2)); if (!A.size || !B.size) return false; let k = 0; A.forEach(w => { if (B.has(w)) k++; }); return k / Math.min(A.size, B.size) >= 0.6; };

export async function pushCalendar(prefs) {
  const cal = prefs.gcalCalendarId || 'primary', cached = store.state.gcal?.events || [], today = todayISO();
  const patches = [], errors = [];
  // Work from a snapshot, but write only the Google bookkeeping fields back onto the *latest* record,
  // so edits you make while a sync is running are never overwritten.
  const snapshot = Object.values(store.state.items).filter(Boolean);
  for (const it of snapshot) {
    try {
      if (it.del) {
        if (it.gcal?.id && it.gcal.own && !it.gcal.gone) { const r = await call('DELETE', `/calendars/${encodeURIComponent(it.gcal.calId || cal)}/events/${it.gcal.id}`); if (okGone(r)) patches.push({ id: it.id, u: it.u, gcal: { ...it.gcal, gone: true } }); }
        continue;
      }
      if (it.src === 'gcal') continue;
      const reason = calReason(it), date = it.kind === 'event' ? it.date : it.due;
      if (!reason || !date) {
        if (it.gcal?.id && it.gcal.own) { const r = await call('DELETE', `/calendars/${encodeURIComponent(it.gcal.calId || cal)}/events/${it.gcal.id}`); if (okGone(r)) patches.push({ id: it.id, u: it.u, gcal: null }); }
        continue;
      }
      if (!it.gcal?.id && date < addDays(today, -1)) continue; // don't backfill the past
      const body = eventBody(it, reason), h = hashBody(body);
      if (it.gcal?.h === h) continue;
      if (it.gcal?.id && !it.gcal.own) { patches.push({ id: it.id, u: it.u, gcal: { ...it.gcal, h } }); continue; } // linked to your own event: never edit it
      if (!it.gcal?.id) {
        const dup = cached.find(e => !e.quietId && e.date === date && similar(it.title, e.title));
        if (dup) { patches.push({ id: it.id, u: it.u, gcal: { id: dup.id, calId: dup.calId, own: false, h, link: dup.link } }); continue; }
        const id = eventIdFor(it.id);
        let r = await call('POST', `/calendars/${encodeURIComponent(cal)}/events`, { ...body, id });
        if (r.status === 409) r = await call('PUT', `/calendars/${encodeURIComponent(cal)}/events/${id}`, { ...body, status: 'confirmed' }); // created by another device, or re-enabled
        if (!r.ok) throw new Error(r.j?.error?.message || `Calendar ${r.status}`);
        patches.push({ id: it.id, u: it.u, gcal: { id, calId: cal, own: true, h, link: r.j.htmlLink, at: Date.parse(r.j.updated) || Date.now() } });
      } else {
        const r = await call('PUT', `/calendars/${encodeURIComponent(it.gcal.calId || cal)}/events/${it.gcal.id}`, body);
        if (r.status === 404 || r.status === 410) { patches.push({ id: it.id, u: it.u, gcal: null, cal: false }); continue; } // deleted in Google: respect that
        if (!r.ok) throw new Error(r.j?.error?.message || `Calendar ${r.status}`);
        patches.push({ id: it.id, u: it.u, gcal: { ...it.gcal, h, link: r.j.htmlLink || it.gcal.link, at: Date.parse(r.j.updated) || Date.now() } });
      }
    } catch (e) {
      if (e.auth) throw e;
      errors.push(`${it.title || it.id}: ${e.message}`);
      if (/rate|quota|403/i.test(e.message)) break; // back off; the rest goes next sync
    }
  }
  const ops = [];
  for (const pt of patches) {
    const cur = store.state.items[pt.id]; if (!cur) continue;
    const changed = cur.u !== pt.u; // edited while we were talking to Google: keep the link, re-push next time
    const gcal = pt.gcal && changed ? { ...pt.gcal, h: null } : pt.gcal;
    ops.push({ c: 'items', rec: { ...cur, gcal, ...('cal' in pt ? { cal: pt.cal } : {}) }, soft: true });
  }
  if (ops.length) await store.write(ops, { dirty: false });
  await syncBedtime(prefs, cal).catch(e => errors.push('Bedtime reminder: ' + e.message));
  if (errors.length) throw new Error(errors.length === 1 ? errors[0] : `${errors.length} items didn't sync (${errors[0]})`);
  return ops.length;
}

async function syncBedtime(prefs, cal) {
  const id = 'quietbedtime1', key = 'x.bedtimeEvent', cur = prefs[key];
  if (!prefs.gcalBedtimeEvent) {
    if (cur) { const r = await call('DELETE', `/calendars/${encodeURIComponent(cur.calId)}/events/${id}`); if (okGone(r)) await store.write([{ c: 'prefs', id: key, del: true }], { dirty: false }); }
    return;
  }
  const start = fromMin((toMin(prefs.bedtime) - 30 + 1440) % 1440), endT = fromMin((toMin(start) + 15) % 1440);
  const h = hashStr([start, cal].join('|')); // only the time matters — don't rewrite the series every day
  if (cur?.h === h) return;
  const d = todayISO(), body = {
    summary: 'Wind down 🌙', description: 'Screens off soon. Added by Quiet.', transparency: 'transparent',
    start: { dateTime: `${d}T${start}:00`, timeZone: tz() }, end: { dateTime: `${endT < start ? addDays(d, 1) : d}T${endT}:00`, timeZone: tz() },
    recurrence: ['RRULE:FREQ=DAILY'], reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] }, extendedProperties: { private: { quietId: 'bedtime' } },
  };
  let r = await call('PUT', `/calendars/${encodeURIComponent(cal)}/events/${id}`, { ...body, status: 'confirmed' });
  if (r.status === 404) r = await call('POST', `/calendars/${encodeURIComponent(cal)}/events`, { ...body, id });
  if (!r.ok) throw new Error(r.j?.error?.message || `Calendar ${r.status}`);
  await store.write([{ c: 'prefs', rec: { id: key, v: { calId: cal, h } } }], { dirty: false });
}
