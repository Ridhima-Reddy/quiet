import { useEffect, useRef, useState } from 'preact/hooks';
import { useQ, useNow } from '../ctx.jsx';
import { Icon } from '../icons.jsx';
import { Mascot, Seg } from '../components.jsx';
import { Steps } from './ItemDetail.jsx';
import { store } from '../../core/store.js';
import { setFocus, updateItem } from '../../core/actions.js';
import { focusState } from '../../core/nudges.js';
import { pickNext } from '../../core/wellbeing.js';
import { sounds } from '../sound.js';
import { isExt } from '../../core/platform.js';

const LENGTHS = [[15, '15'], [25, '25'], [45, '45'], [60, '60'], [90, '90']];

export async function startFocus({ itemId = null, sid = null, title = '', minutes = 25, kind = 'focus' }) {
  const now = Date.now();
  await setFocus({ id: 'f' + now, itemId, sid, title, start: now, end: now + minutes * 60e3, minutes, kind, paused: false, notified: false });
  if (isExt) chrome.runtime.sendMessage({ type: 'focus-changed' }).catch(() => {});
}
/** Called when a focus block ends (from whichever surface notices first). Idempotent. */
export async function finishFocus(f, { early = false } = {}) {
  if (!f || f.notified) return;
  const mins = early ? Math.max(1, Math.round((Date.now() - f.start) / 60e3)) : f.minutes;
  if (f.kind === 'focus') await store.put('focus', { id: f.id, itemId: f.itemId, sid: f.sid, start: f.start, minutes: mins });
  await setFocus({ ...f, notified: true, end: early ? Date.now() : f.end });
}

export function Focus({ itemId: initialItem, sid: initialSid }) {
  const q = useQ(), { state, prefs, p, energy } = q;
  const now = useNow(1000);
  const f = focusState(prefs, now);
  const running = f && (f.active || f.paused) && !f.notified;
  const ended = f && !f.paused && !f.active && !f.notified && now >= f.end;
  const [len, setLen] = useState(prefs['x.focusLen'] || 25);
  const next = !initialItem ? pickNext(state, prefs, p, { energy }) : null;
  const [itemId, setItemId] = useState(initialItem || next?.item.id || null);
  const it = state.items[running || ended ? f.itemId : itemId];
  const fired = useRef(false);
  useEffect(() => { if (ended && !fired.current) { fired.current = true; if (prefs.sound) sounds.chime(); finishFocus(f); if (f.kind === 'focus') q.celebrate({ big: false }); } }, [ended]);
  const left = f ? (f.paused ? f.pausedLeft : Math.max(0, f.end - now)) : len * 60e3;
  const total = f ? f.minutes * 60e3 : len * 60e3;
  const mm = Math.floor(left / 60e3), ss = Math.floor((left % 60e3) / 1000);
  const R = 118, C = 2 * Math.PI * R, frac = running ? left / total : 1;
  const todays = (p.byDay[p.today] || []).filter(s => !s.done).map(s => state.items[s.itemId]).filter(Boolean);

  const done = f && f.notified && now - f.end < 30 * 60e3;
  return (
    <div class="focus" role="dialog" aria-label="Focus">
      <button class="btn ghost x" onClick={q.close} title={running ? 'Hide — the timer keeps running' : 'Close'}><Icon name="x" />{running ? 'Hide' : ''}</button>
      <Mascot type={prefs.companion === 'none' ? 'moss' : prefs.companion} size={64} sleep={running && f.kind === 'focus'} happy={done} />
      {!running && !done && <>
        <h2>What will you focus on?</h2>
        <select class="select" style="max-width:420px" value={itemId || ''} onChange={e => setItemId(e.currentTarget.value || null)}>
          <option value="">Just focus — no specific task</option>
          {[...new Map([...(it ? [it] : []), ...todays].map(x => [x.id, x])).values()].map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
        </select>
        <Seg value={len} options={LENGTHS.map(([v, l]) => [v, l + ' min'])} onChange={v => { setLen(v); store.setPref('x.focusLen', v); }} />
        <button class="btn primary lg" onClick={() => startFocus({ itemId, sid: initialSid, title: state.items[itemId]?.title || '', minutes: len })}><Icon name="play" size={16} />Start focus</button>
        <div class="small muted">Nudges pause until you're done.</div>
      </>}
      {(running || ended) && <>
        <div class="ring">
          <svg width="100%" height="100%" viewBox="0 0 260 260"><circle cx="130" cy="130" r={R} fill="none" stroke="var(--surface-3)" stroke-width="6" /><circle cx="130" cy="130" r={R} fill="none" stroke={f.kind === 'break' ? 'var(--care)' : 'var(--accent)'} stroke-width="6" stroke-linecap="round" stroke-dasharray={C} stroke-dashoffset={C * (1 - frac)} style="transition:stroke-dashoffset 1s linear" /></svg>
          <div class="tm">{String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}</div>
        </div>
        <h2>{f.kind === 'break' ? 'Break. Look away from the screen.' : f.title || 'Focus'}</h2>
        {f.kind === 'focus' && it?.steps && <div class="steps"><Steps compact it={it} onToggle={async (ci, si) => { const s2 = JSON.parse(JSON.stringify(it.steps)); s2.chunks[ci].steps[si].done = !s2.chunks[ci].steps[si].done; await updateItem(it.id, { steps: s2 }); }} onNext={() => { const s2 = JSON.parse(JSON.stringify(it.steps)); s2.cur = Math.min(s2.cur + 1, s2.chunks.length - 1); updateItem(it.id, { steps: s2 }); }} /></div>}
        <div class="row">
          {f.paused ? <button class="btn primary" onClick={() => setFocus({ ...f, paused: false, end: Date.now() + f.pausedLeft })}><Icon name="play" size={15} />Resume</button>
            : <button class="btn" onClick={() => setFocus({ ...f, paused: true, pausedLeft: Math.max(0, f.end - Date.now()) })}><Icon name="pause" size={15} />Pause</button>}
          <button class="btn" onClick={() => setFocus({ ...f, end: f.end + 5 * 60e3, minutes: f.minutes + 5, pausedLeft: f.paused ? f.pausedLeft + 5 * 60e3 : f.pausedLeft })}>+5 min</button>
          <button class="btn ghost" onClick={async () => { await finishFocus(f, { early: true }); }}><Icon name="stop" size={14} />End</button>
        </div>
      </>}
      {done && !running && <>
        <h2>{f.kind === 'break' ? 'Break over.' : `Nice focus${f.title ? ` on “${f.title}”` : ''}.`}</h2>
        <div class="small muted">{f.kind === 'break' ? 'Ready for another round? Or call it here — both are fine.' : 'Stand up, stretch, drink some water.'}</div>
        <div class="row wrap center">
          {f.kind === 'focus' && <button class="btn primary" onClick={() => startFocus({ minutes: 5, kind: 'break', itemId: f.itemId, title: f.title })}>5 min break</button>}
          <button class="btn" onClick={() => startFocus({ itemId: f.itemId, sid: f.sid, title: f.title, minutes: prefs['x.focusLen'] || 25 })}>Another round</button>
          {it && it.status !== 'done' && <button class="btn" onClick={async e => { await q.checkItem(it, e); }}><Icon name="check" size={15} />Task done</button>}
          <button class="btn ghost" onClick={async () => { await setFocus(null); q.close(); }}>Close</button>
        </div>
      </>}
    </div>
  );
}

/** Small "focus running" chip for the sidebar / popup. */
export function FocusMini() {
  const q = useQ(), now = useNow(1000), f = focusState(q.prefs, now);
  if (!f || f.notified || (!f.active && !f.paused && now >= f.end + 1000)) return null;
  const left = f.paused ? f.pausedLeft : Math.max(0, f.end - now);
  return <div class="focus-mini" onClick={() => q.open('focus', {})}><Icon name={f.paused ? 'pause' : 'clock'} size={15} /><span class="grow">{f.kind === 'break' ? 'Break' : f.title || 'Focus'}</span><b style="font-variant-numeric:tabular-nums">{Math.floor(left / 60e3)}:{String(Math.floor(left % 60e3 / 1000)).padStart(2, '0')}</b></div>;
}
