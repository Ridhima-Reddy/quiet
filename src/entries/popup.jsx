// Extension toolbar popup: a glanceable "today" widget. Tick things off, dump a thought, start focus.
import { render } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { QuietProvider, useQ } from '../ui/ctx.jsx';
import { Icon } from '../ui/icons.jsx';
import { SessionRow, SyncPill, Mascot, Battery } from '../ui/components.jsx';
import { Dump } from '../ui/sheets/Dump.jsx';
import { ItemDetail } from '../ui/sheets/ItemDetail.jsx';
import { FocusMini, startFocus } from '../ui/sheets/Focus.jsx';
import { store } from '../core/store.js';
import { MASCOT_CSS } from '../ui/mascot.js';
import { pickNext, companionLine } from '../core/wellbeing.js';
import { dayLoad } from '../core/planner.js';
import { fmtMin, partOfDay } from '../core/dates.js';
import { checkin } from '../core/actions.js';
import { startAutoSync } from '../google/sync.js';
import { initDnd } from '../ui/dnd.js';

document.head.insertAdjacentHTML('beforeend', `<style>${MASCOT_CSS} body{width:390px;min-height:540px} .main{padding:14px 16px 18px} .sheet.modal{top:8px;max-height:calc(100vh - 16px)} .sheet.drawer{width:100%} .toasts{bottom:12px}</style>`);
const openApp = (hash = '') => { chrome.tabs.create({ url: chrome.runtime.getURL('app.html') + hash }); window.close(); };

function Popup() {
  const q = useQ(), { state, prefs, p, today, sheet } = q;
  const list = (p.byDay[today] || []).filter(s => !s.done || q.recent[s.id]);
  const done = (p.byDay[today] || []).filter(s => s.done).length;
  const ld = dayLoad(p, today);
  const next = useMemo(() => pickNext(state, prefs, p, { energy: q.energy }), [p, q.energy]);
  const ci = state.checkins[today];
  return (
    <div class="main">
      <div class="row" style="margin-bottom:10px">
        <Mascot type={prefs.companion === 'none' ? 'moss' : prefs.companion} size={44} />
        <div class="grow"><div class="serif" style="font-size:19px">{{ morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Still up' }[partOfDay()]}{prefs.name ? `, ${prefs.name}` : ''}</div>
          <div class="small muted">{companionLine(state, prefs, p)}</div></div>
        <button class="btn ghost icon" title="Open Quiet" onClick={() => openApp('#/today')}><Icon name="right" /></button>
      </div>
      <button class="btn primary" style="width:100%;height:40px;border-radius:12px;justify-content:flex-start" onClick={() => q.open('dump')}><Icon name="feather" size={17} />What's on your mind?</button>
      {!ci?.energy && partOfDay() !== 'night' && <div class="row small" style="margin-top:10px;gap:6px"><span class="muted grow">Energy?</span>{[[1, 'Low'], [2, 'Okay'], [3, 'Good'], [4, 'Great']].map(([v, l]) => <button key={v} class="btn sm" onClick={() => checkin(today, { energy: v })}><Battery level={v} />{l}</button>)}</div>}
      <div style="margin-top:10px"><FocusMini /></div>
      {next && <div class="start" style="margin-top:12px;padding:14px 16px"><div class="eyebrow">Start here</div><div class="serif" style="font-size:17px;margin:4px 0 2px">{next.item.title}</div><div class="small muted">{fmtMin(next.session.minutes)} · {next.reason}</div>
        <div class="acts" style="margin-top:10px"><button class="btn sm primary" onClick={() => { startFocus({ itemId: next.item.id, sid: next.session.id, title: next.item.title, minutes: prefs['x.focusLen'] || 25 }); q.toast('Focus started. Nudges paused.'); }}><Icon name="play" size={13} />Focus</button><button class="btn sm" onClick={e => q.check(next.session, e)}><Icon name="check" size={13} />Done</button></div></div>}
      <div class="section" style="margin-top:14px">
        <div class="section-h"><h2>Today</h2><span class="muted">{done} done · {ld.label.toLowerCase()} day</span></div>
        <div class="list">{list.map(s => <SessionRow key={s.id} s={s} />)}{!list.length && <div class="muted small" style="padding:8px 0">{done ? 'All done for today. Proud of you.' : 'Nothing planned today.'}</div>}</div>
      </div>
      <div class="row" style="margin-top:14px"><SyncPill /><span class="grow" /><button class="btn sm ghost" onClick={() => openApp('#/plan')}>Plan</button><button class="btn sm ghost" onClick={() => openApp('#/you')}>Settings</button></div>
      {sheet?.type === 'dump' && <Dump {...sheet} />}
      {sheet?.type === 'item' && <ItemDetail key={sheet.id} {...sheet} />}
      {sheet?.type === 'focus' && (openApp('#/focus'), null)}
      {sheet?.type === 'lighten' && (openApp('#/plan'), null)}
    </div>
  );
}
store.init().then(() => { render(<QuietProvider surface="popup"><Popup /></QuietProvider>, document.getElementById('root')); startAutoSync(); initDnd(document.body, () => {}); });
