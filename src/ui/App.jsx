import { useEffect, useRef, useState } from 'preact/hooks';
import { QuietProvider, useQ, bus, useNow } from './ctx.jsx';
import { Icon } from './icons.jsx';
import { Mascot, SyncPill } from './components.jsx';
import { Today } from './views/Today.jsx';
import { Plan } from './views/Plan.jsx';
import { Tasks } from './views/Tasks.jsx';
import { Week } from './views/Week.jsx';
import { You } from './views/You.jsx';
import { Study } from './views/Study.jsx';
import { Dump } from './sheets/Dump.jsx';
import { ItemDetail } from './sheets/ItemDetail.jsx';
import { Focus, FocusMini, finishFocus } from './sheets/Focus.jsx';
import { Lighten } from './sheets/Lighten.jsx';
import { Onboarding } from './sheets/Onboarding.jsx';
import { initDnd } from './dnd.js';
import { moveSession, moveToBucket, moveEvent, pinItemToDay } from '../core/actions.js';
import { relDay } from '../core/dates.js';
import { companionLine } from '../core/wellbeing.js';
import { dueNudge, markShown, focusState } from '../core/nudges.js';
import { NUDGES, COMPANIONS } from '../core/model.js';
import { store } from '../core/store.js';
import { startAutoSync } from '../google/sync.js';
import { isExt, isDesktop } from '../core/platform.js';
import { sounds } from './sound.js';

const NAV = [['today', 'Today', 'sun'], ['plan', 'Plan', 'calendar'], ['tasks', 'Tasks', 'board'], ['week', 'Week', 'chart'], ['you', 'You', 'user']];
const route = () => (location.hash.replace(/^#\/?/, '').split(/[?/]/)[0] || 'today');

export function App() {
  return <QuietProvider><Shell /></QuietProvider>;
}

function Shell() {
  const q = useQ(), { sheet, prefs, local } = q;
  const [r, setR] = useState(route());
  const qref = useRef(q); qref.current = q;
  useEffect(() => {
    const f = () => {
      const x = route();
      if (x === 'dump') { history.replaceState(null, '', '#/today'); setR('today'); qref.current.open('dump'); return; }
      if (x === 'focus') { history.replaceState(null, '', '#/today'); setR('today'); qref.current.open('focus', {}); return; }
      setR(x); window.scrollTo(0, 0);
    };
    addEventListener('hashchange', f); f(); return () => removeEventListener('hashchange', f);
  }, []);
  // Drag & drop
  useEffect(() => initDnd(document.body, async (drag, drop) => {
    const { p, toast, state, today } = qref.current;
    const [dk, did] = [drag.slice(0, drag.indexOf(':')), drag.slice(drag.indexOf(':') + 1)];
    const [tk, tv] = [drop.slice(0, drop.indexOf(':')), drop.slice(drop.indexOf(':') + 1)];
    let res = null, label = tk === 'day' ? relDay(tv, today) : { today: 'Today', tomorrow: 'Tomorrow', week: 'later this week', nextweek: 'next week', later: 'Later', anytime: 'Anytime' }[tv];
    if (dk === 's') { const s = p.sessions.find(x => x.id === did); if (!s) return; res = tk === 'day' ? await moveSession(s, tv) : await moveToBucket(s.itemId, tv, p); }
    else if (dk === 'i') { if (tk === 'bucket') res = await moveToBucket(did, tv, p); else { const s = p.sessions.find(x => x.itemId === did && !x.done); res = s ? await moveSession(s, tv) : await pinItemToDay(did, tv); } }
    else if (dk === 'e' && tk === 'day') res = await moveEvent(did, tv);
    if (res) toast(res.late ? `Moved to ${label} — that's after it's due.` : `Moved to ${label}.`, { undo: res.undo });
  }), []);
  // Keyboard shortcuts
  useEffect(() => {
    const k = e => {
      if (e.target.closest?.('input,textarea,select,[contenteditable]') || e.altKey) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); qref.current.open('dump'); return; }
      if (e.ctrlKey || e.metaKey || document.querySelector('.sheet,.focus')) return;
      if (e.key === 'd' || e.key === 'n') { e.preventDefault(); qref.current.open('dump'); }
      if (e.key === 'f') qref.current.open('focus', {});
      const i = '12345'.indexOf(e.key); if (i >= 0) location.hash = '#/' + NAV[i][0];
    };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, []);
  // First run
  useEffect(() => { if (!local.onboarded && !Object.values(store.state.items).length && !Object.values(store.state.goals).length) q.open('onboard'); }, []);
  useEffect(() => { startAutoSync(); }, []);

  const View = { today: Today, plan: Plan, tasks: Tasks, week: Week, you: You, study: Study }[r] || Today;
  return (
    <div class="app">
      <nav class="side" aria-label="Main">
        <div class="brand"><span class="brand-mark" />quiet</div>
        <button class="btn primary dump-btn" onClick={() => q.open('dump')}><Icon name="feather" size={17} />Brain dump<span class="kbd" style="margin-left:auto;color:inherit;border-color:rgba(255,255,255,.35)">D</span></button>
        {NAV.map(([id, label, icon], i) => <button key={id} class={`nav-btn ${r === id ? 'on' : ''}`} onClick={() => { location.hash = '#/' + id; }} aria-current={r === id ? 'page' : undefined}><Icon name={icon} />{label}<span class="kbd">{i + 1}</span></button>)}
        <button class="nav-btn" onClick={() => q.open('focus', {})}><Icon name="clock" />Focus<span class="kbd">F</span></button>
        <div class="side-foot"><FocusMini /><SyncPill /></div>
      </nav>
      <header class="topbar">
        <div class="brand"><span class="brand-mark" />quiet</div>
        <SyncPill />
        <a class="btn ghost icon" href="#/you" aria-label="You and settings">{local.google?.picture ? <img src={local.google.picture} width="26" height="26" style="border-radius:50%" alt="" referrerpolicy="no-referrer" /> : <Icon name="user" />}</a>
      </header>
      <main class="main" id="main"><div class="mobile-focus" style="margin-bottom:8px"><MobileFocus /></div><View /></main>
      <nav class="tabbar" aria-label="Main">
        {NAV.slice(0, 2).map(([id, label, icon]) => <button key={id} class={r === id ? 'on' : ''} onClick={() => { location.hash = '#/' + id; }}><Icon name={icon} size={21} />{label}</button>)}
        <button onClick={() => q.open('dump')} aria-label="Brain dump"><span class="fab"><Icon name="plus" size={24} /></span></button>
        {NAV.slice(2, 4).map(([id, label, icon]) => <button key={id} class={r === id ? 'on' : ''} onClick={() => { location.hash = '#/' + id; }}><Icon name={icon} size={21} />{label}</button>)}
      </nav>
      <Dock />
      {sheet?.type === 'dump' && <Dump {...sheet} />}
      {sheet?.type === 'item' && <ItemDetail key={sheet.id} {...sheet} />}
      {sheet?.type === 'focus' && <Focus {...sheet} />}
      {sheet?.type === 'lighten' && <Lighten {...sheet} />}
      {sheet?.type === 'onboard' && <Onboarding />}
      <FocusWatcher />
    </div>
  );
}

function MobileFocus() { return matchMedia('(max-width: 760px)').matches ? <FocusMini /> : null; }

/** Notices when a focus block ends while the overlay is hidden. */
function FocusWatcher() {
  const q = useQ(), now = useNow(3000), f = focusState(q.prefs, now);
  const seen = useRef('');
  useEffect(() => {
    if (!f || f.notified || f.paused || now < f.end || q.sheet?.type === 'focus' || seen.current === f.id) return;
    seen.current = f.id;
    if (q.prefs.sound) sounds.chime();
    finishFocus(f).then(() => q.open('focus', {}));
  }, [now]);
  return null;
}

/** The companion in the corner: a kind line when you click it, nudges while Quiet is open (web/phone). */
function Dock() {
  const q = useQ(), { prefs, state, p, local } = q;
  const [msg, setMsg] = useState(null);
  const timer = useRef();
  const say = (m, ms = 9000) => { setMsg(m); clearTimeout(timer.current); if (ms) timer.current = setTimeout(() => setMsg(null), ms); };
  useEffect(() => { const t = setTimeout(() => say({ text: companionLine(state, prefs, p) }, 7000), 1500); return () => clearTimeout(t); }, []);
  useEffect(() => { const f = e => { if (e.detail?.big) say({ text: e.detail.text || 'Look at you go!' }, 5000); }; bus.addEventListener('cheer', f); return () => bus.removeEventListener('cheer', f); }, []);
  // In-app nudges on the web/phone app. (The extension and desktop app show nudges themselves.)
  useEffect(() => {
    if (isExt || isDesktop) return;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      const n = dueNudge(store.state, store.prefs(), store.local);
      if (!n || n.type === 'focus-end') return;
      store.setLocal({ lastNudge: markShown(store.local, n, store.prefs()) });
      if (store.prefs().sound) sounds.soft();
      say({ title: n.title, text: n.text, nudge: n }, 30000);
    };
    const t = setInterval(tick, 60e3); setTimeout(tick, 8000);
    return () => clearInterval(t);
  }, []);
  // Extension: nudges arriving while this tab is the active one
  useEffect(() => {
    if (!isExt) return;
    const f = m => { if (m?.type === 'nudge' && document.visibilityState === 'visible') say({ title: m.title, text: m.text, nudge: m }, 30000); };
    chrome.runtime.onMessage.addListener(f); return () => chrome.runtime.onMessage.removeListener(f);
  }, []);
  if ((prefs.companion === 'none' || isDesktop) && !msg) return null; // desktop: the on-screen widget is the companion
  const name =COMPANIONS.find(c => c.id === prefs.companion)?.name || 'Quiet';
  const f = focusState(prefs);
  return (
    <div class="dock">
      {msg && <div class="bubble" role="status"><b>{msg.title || name}</b>{msg.text}
        {msg.nudge && <div class="acts">{msg.nudge.type === 'brief' ? <button class="btn sm primary" onClick={() => { setMsg(null); location.hash = '#/today'; }}>Open today</button> : <button class="btn sm primary" onClick={() => { setMsg(null); q.celebrate({}); }}>Done</button>}
          <button class="btn sm ghost" onClick={() => { if (msg.nudge.type !== 'brief') store.setLocal({ lastNudge: markShown(store.local, msg.nudge, store.prefs(), { snooze: true }) }); setMsg(null); }}>Later</button></div>}
      </div>}
      {prefs.companion !== 'none' && <div class="pet" onClick={() => say({ text: companionLine(state, prefs, p, new Date()) })} title={name}><Mascot type={prefs.companion} size={68} sleep={!!f?.active && f.kind === 'focus'} /></div>}
    </div>
  );
}
