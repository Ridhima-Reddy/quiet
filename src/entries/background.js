// Extension service worker: nudges on the page you're on, focus timer end, badge, background sync.
import { store } from '../core/store.js';
import { dueNudge, markShown, focusState } from '../core/nudges.js';
import { plan } from '../core/planner.js';
import { todayISO } from '../core/dates.js';
import { COMPANIONS } from '../core/model.js';
import { syncNow } from '../google/sync.js';

const ready = store.init();
const setup = async () => {
  await chrome.alarms.create('tick', { periodInMinutes: 1 });
  await chrome.alarms.create('sync', { periodInMinutes: 10, delayInMinutes: 1 });
};
chrome.runtime.onInstalled.addListener(async d => { await setup(); if (d.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('app.html') }); badge(); });
chrome.runtime.onStartup.addListener(async () => { await setup(); badge(); });

async function badge() {
  await ready;
  try {
    const p = plan(store.state, store.prefs(), {}), left = (p.byDay[todayISO()] || []).filter(s => !s.done).length;
    await chrome.action.setBadgeBackgroundColor({ color: '#4E7360' });
    await chrome.action.setBadgeText({ text: left ? String(left) : '' });
    await chrome.action.setTitle({ title: left ? `Quiet · ${left} thing${left > 1 ? 's' : ''} left today` : 'Quiet' });
  } catch {}
}

async function show(n) {
  const prefs = store.prefs();
  const msg = { type: 'nudge', ...n, companion: prefs.companion, name: COMPANIONS.find(c => c.id === prefs.companion)?.name || 'Quiet', sound: prefs.sound };
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab?.url?.startsWith(chrome.runtime.getURL(''))) { try { await chrome.runtime.sendMessage(msg); return true; } catch {} }
  if (tab?.id && /^https?:|^file:/.test(tab.url || '')) {
    try { await chrome.tabs.sendMessage(tab.id, msg); return true; } catch {}
    try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }); await chrome.tabs.sendMessage(tab.id, msg); return true; } catch {}
  }
  // Fallback (e.g. on chrome:// pages or when no window is focused): a system notification
  try { await chrome.notifications.create('quiet-' + n.type, { type: 'basic', iconUrl: 'icons/icon-128.png', title: n.title, message: n.text, priority: 0 }); return true; } catch { return false; }
}

async function tick() {
  await ready;
  const prefs = store.prefs(), now = new Date();
  const f = focusState(prefs, now.getTime());
  if (f && !f.notified && !f.paused && now.getTime() >= f.end) {
    if (f.kind === 'focus') await store.put('focus', { id: f.id, itemId: f.itemId, sid: f.sid, start: f.start, minutes: f.minutes });
    await store.setPref('x.focus', { ...f, notified: true });
    await show({ type: 'focus-end', title: f.kind === 'break' ? 'Break over' : 'Focus done', text: f.kind === 'break' ? 'Ready for another round? Or call it here — both are fine.' : `Nice work${f.title ? ` on “${f.title}”` : ''}. Take 5 minutes: stand, stretch, water.`, buttons: f.kind === 'break' ? ['Start focus', 'Done for now'] : ['Start break', 'Skip'] });
    return;
  }
  const n = dueNudge(store.state, prefs, store.local, now);
  if (n && n.type !== 'focus-end') { if (await show(n)) await store.setLocal({ lastNudge: markShown(store.local, n, prefs) }); }
  badge();
}

chrome.alarms.onAlarm.addListener(a => {
  if (a.name === 'tick') tick();
  if (a.name === 'sync') ready.then(() => store.local.google?.connected && syncNow()).then(badge);
});

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  (async () => {
    await ready;
    const prefs = store.prefs();
    if (m.type === 'preview-nudge') await show({ type: 'water', title: 'Water', text: 'A few sips of water? (This is a preview.)', buttons: ['Done', 'Later'] });
    if (m.type === 'nudge-action') {
      const n = m.nudge || {}, a = m.action;
      if (a === 'later' && n.type !== 'brief' && n.type !== 'focus-end') await store.setLocal({ lastNudge: markShown(store.local, n, prefs, { snooze: true }) });
      if (a === 'open') chrome.tabs.create({ url: chrome.runtime.getURL('app.html') + (m.hash || '#/today') });
      if (a === 'start-break' || a === 'start-focus') { const now = Date.now(), mins = a === 'start-break' ? 5 : (prefs['x.focusLen'] || 25), f = focusState(prefs) || {}; await store.setPref('x.focus', { id: 'f' + now, itemId: f.itemId || null, title: f.title || '', start: now, end: now + mins * 60e3, minutes: mins, kind: a === 'start-break' ? 'break' : 'focus', notified: false }); }
    }
    reply?.({ ok: true });
  })();
  return true;
});
store.subscribe(() => { clearTimeout(globalThis.__qb); globalThis.__qb = setTimeout(badge, 500); });
