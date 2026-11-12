// Desktop companion widget: a small always-on-top friend in the corner of your screen.
// Collapsed: just the companion. Click: your next task, today's list, quick add, focus.
// Nudges appear as a speech bubble — no OS notification spam.
import { render } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { QuietProvider, useQ, useNow } from '../ui/ctx.jsx';
import { Icon } from '../ui/icons.jsx';
import { SessionRow, Mascot } from '../ui/components.jsx';
import { FocusMini, startFocus, finishFocus } from '../ui/sheets/Focus.jsx';
import { store } from '../core/store.js';
import { MASCOT_CSS } from '../ui/mascot.js';
import { pickNext, companionLine } from '../core/wellbeing.js';
import { dueNudge, markShown, focusState } from '../core/nudges.js';
import { fmtMin } from '../core/dates.js';
import { offlineExtract, toItems } from '../core/extract.js';
import { addItems } from '../core/actions.js';
import { startAutoSync } from '../google/sync.js';
import { sounds } from '../ui/sound.js';

const N = globalThis.quietNative;
document.head.insertAdjacentHTML('beforeend', `<style>${MASCOT_CSS}
html,body{background:transparent!important;overflow:hidden;height:100%}
.w{position:fixed;inset:0;display:flex;flex-direction:column;justify-content:flex-end;align-items:flex-end;padding:8px}
.grip{-webkit-app-region:drag;height:14px;width:44px;border-radius:7px;background:rgba(0,0,0,.08);margin:0 auto 4px;opacity:0;transition:opacity .2s}
.w:hover .grip{opacity:1}
.panel{width:100%;background:var(--surface);border:1px solid var(--line);border-radius:18px;box-shadow:0 10px 40px rgba(0,0,0,.18);padding:12px 14px;margin-bottom:6px;overflow:auto;max-height:calc(100vh - 100px);animation:rise .3s var(--ease) both}
.pet{cursor:pointer;filter:drop-shadow(0 6px 10px rgba(0,0,0,.15));-webkit-app-region:no-drag}
.wb{background:var(--surface);border:1px solid var(--line);border-radius:16px 16px 4px 16px;padding:11px 14px;box-shadow:0 10px 30px rgba(0,0,0,.16);font-size:13.5px;margin:0 8px 0 0;max-width:260px;animation:rise .3s var(--ease) both}
.wb b{display:block;color:var(--accent);font-size:12px}
.toasts{bottom:96px}
</style>`);

function Widget() {
  const q = useQ(), { state, prefs, p, today } = q;
  const [mode, setMode] = useState('pet'); // pet | panel | bubble
  const [bubble, setBubble] = useState(null);
  const [add, setAdd] = useState('');
  useEffect(() => { N?.widgetSize?.(mode === 'panel' ? 'panel' : mode === 'bubble' ? 'bubble' : 'pet'); }, [mode]);
  const now = useNow(5000);
  const f = focusState(prefs, now);
  const next = useMemo(() => pickNext(state, prefs, p, { energy: q.energy }), [p, q.energy]);
  const list = (p.byDay[today] || []).filter(s => !s.done || q.recent[s.id]);
  const shownFocus = useRef('');
  // nudges + focus end, once a minute
  useEffect(() => {
    const tick = () => {
      const pr = store.prefs(), fs = focusState(pr);
      if (fs && !fs.notified && !fs.paused && Date.now() >= fs.end && shownFocus.current !== fs.id) {
        shownFocus.current = fs.id; finishFocus(fs);
        if (pr.sound) sounds.chime();
        setBubble({ title: fs.kind === 'break' ? 'Break over' : 'Focus done', text: fs.kind === 'break' ? 'Another round, or call it here?' : `Nice work${fs.title ? ` on “${fs.title}”` : ''}. Stand up, stretch, water.`, kind: 'focus-end', fs }); setMode('bubble');
        return;
      }
      const n = dueNudge(store.state, pr, store.local);
      if (!n || n.type === 'focus-end') return;
      store.setLocal({ lastNudge: markShown(store.local, n, pr) });
      if (pr.sound) sounds.soft();
      setBubble({ title: n.title, text: n.text, nudge: n }); setMode('bubble');
      setTimeout(() => setMode(m => m === 'bubble' ? 'pet' : m), 30000);
    };
    const t = setInterval(tick, 60e3); setTimeout(tick, 15000);
    return () => clearInterval(t);
  }, []);
  const quickAdd = async () => {
    const v = add.trim(); if (!v) return;
    const its = toItems(offlineExtract(v, Object.values(state.goals).filter(g => g && !g.del), today), []);
    if (!its.length) return; const r = await addItems(its); setAdd(''); q.toast('Added.', { undo: r.undo });
  };

  return (
    <div class="w">
      {mode === 'panel' && (
        <div class="panel">
          <div class="row" style="margin-bottom:8px"><b class="serif grow" style="font-size:17px;font-weight:500">{companionLine(state, prefs, p)}</b><button class="btn ghost icon sm" onClick={() => setMode('pet')} aria-label="Collapse"><Icon name="down" size={15} /></button></div>
          <FocusMini />
          {next && !f?.active && <div class="start" style="padding:12px 14px;margin:8px 0"><div class="eyebrow">Next up</div><div class="serif" style="font-size:16px;margin:3px 0">{next.item.title}</div><div class="small muted">{fmtMin(next.session.minutes)} · {next.reason}</div>
            <div class="acts" style="margin-top:8px"><button class="btn sm primary" onClick={() => startFocus({ itemId: next.item.id, sid: next.session.id, title: next.item.title, minutes: prefs['x.focusLen'] || 25 })}><Icon name="play" size={13} />Focus</button><button class="btn sm" onClick={e => q.check(next.session, e)}><Icon name="check" size={13} />Done</button></div></div>}
          <div class="list">{list.map(s => <SessionRow key={s.id} s={s} />)}{!list.length && <div class="small muted">Nothing left today.</div>}</div>
          <div class="row" style="margin-top:8px"><input class="input" style="height:32px" placeholder="Quick add… (e.g. call bank tomorrow 4pm)" value={add} onInput={e => setAdd(e.currentTarget.value)} onKeyDown={e => e.key === 'Enter' && quickAdd()} /></div>
          <div class="row" style="margin-top:8px"><button class="btn sm" onClick={() => N?.openMain('#/dump')}><Icon name="feather" size={13} />Brain dump</button><button class="btn sm ghost" onClick={() => N?.openMain('#/today')}>Open Quiet</button></div>
        </div>
      )}
      <div class="row" style="align-items:flex-end">
        {mode === 'bubble' && bubble && <div class="wb" role="status"><b>{bubble.title}</b>{bubble.text}
          <div class="row" style="margin-top:8px;gap:6px">
            {bubble.kind === 'focus-end' ? <>{bubble.fs.kind === 'focus' && <button class="btn sm primary" onClick={() => { startFocus({ minutes: 5, kind: 'break', itemId: bubble.fs.itemId, title: bubble.fs.title }); setMode('pet'); }}>5 min break</button>}<button class="btn sm" onClick={() => setMode('pet')}>Done</button></>
              : bubble.nudge?.type === 'brief' ? <button class="btn sm primary" onClick={() => { setMode('panel'); }}>Show me</button>
              : <button class="btn sm primary" onClick={e => { q.celebrate({}); setMode('pet'); }}>Done</button>}
            <button class="btn sm ghost" onClick={() => { if (bubble.nudge && bubble.nudge.type !== 'brief') store.setLocal({ lastNudge: markShown(store.local, bubble.nudge, store.prefs(), { snooze: true }) }); setMode('pet'); }}>Later</button>
          </div></div>}
        <div>
          <div class="grip" title="Drag to move" />
          <div class="pet" onClick={() => setMode(m => m === 'panel' ? 'pet' : 'panel')} title="Quiet"><Mascot type={prefs.companion === 'none' ? 'moss' : prefs.companion} size={76} sleep={!!f?.active && f.kind === 'focus'} /></div>
        </div>
      </div>
    </div>
  );
}
store.init().then(() => { render(<QuietProvider surface="widget"><Widget /></QuietProvider>, document.getElementById('root')); startAutoSync({ every: 10 * 60e3 }); });
