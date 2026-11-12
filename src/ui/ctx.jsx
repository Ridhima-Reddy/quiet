import { createContext } from 'preact';
import { useContext, useEffect, useMemo, useState, useCallback, useRef } from 'preact/hooks';
import { store } from '../core/store.js';
import { plan } from '../core/planner.js';
import { lockToday, toggleSession, setItemDone } from '../core/actions.js';
import { todayISO } from '../core/dates.js';
import { confetti } from './confetti.js';
import { sounds, haptic } from './sound.js';

export const Ctx = createContext(null);
export const useQ = () => useContext(Ctx);
export const bus = new EventTarget();
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));

const DONE_LINES = ['Good job.', 'Nicely done.', 'One less thing on your mind.', 'Done. That\'s real progress.', 'Look at you go.', 'Crossed off. Breathe out.', 'Well done — keep going.', 'That\'s off your plate.', 'Lovely. On to the next.'];
const PART_LINES = ['Nice — part {n} of {of} done.', 'Part {n} of {of}. Steady progress.', 'Another piece done ({n}/{of}).'];
const pick = a => a[Math.floor(Math.random() * a.length)];

export function QuietProvider({ children, surface = 'app' }) {
  const [, setVer] = useState(0);
  const [tick, setTick] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [sheet, setSheet] = useState(null);
  const [recent, setRecent] = useState({}); // ids ticked in the last second keep their place briefly
  useEffect(() => store.subscribe(() => setVer(v => v + 1)), []);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 60e3); return () => clearInterval(t); }, []);

  const state = store.state, local = store.local, today = todayISO();
  const prefs = useMemo(() => store.prefs(), [state.prefs]);
  const ci = state.checkins[today];
  const energy = ci && !ci.del ? ci.energy || null : null;
  const p = useMemo(() => plan(state, prefs, { energy }), [state.items, state.sessions, state.gcal, state.prefs, energy, tick, today]);
  useEffect(() => { if (p.toLock.length) lockToday(p); }, [p]);
  useEffect(() => { // theme
    const t = prefs.theme; if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  }, [prefs.theme]);

  const toast = useCallback((text, { undo, ms = 4500, icon } = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t.slice(-2), { id, text, undo, icon }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), ms);
  }, []);
  const dismissToast = id => setToasts(t => t.filter(x => x.id !== id));

  const celebrate = useCallback(({ x, y, big = false, text } = {}) => {
    const pr = store.prefs();
    if (pr.confetti) confetti({ x, y, big });
    if (pr.sound) (big ? sounds.done : sounds.tick)();
    haptic(big ? 20 : 8);
    emit('cheer', { big, text });
  }, []);

  /** Tick a planned session (any day). Celebrates and offers undo. */
  const check = useCallback(async (s, ev) => {
    const r = ev?.currentTarget?.getBoundingClientRect?.();
    const at = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : {};
    if (s.done) { await toggleSession(s, p); return; }
    setRecent(m => ({ ...m, [s.id]: Date.now() }));
    setTimeout(() => setRecent(m => { const n = { ...m }; delete n[s.id]; return n; }), 1100);
    const res = await toggleSession(s, p);
    if (!res) return;
    const st = store.state, d = todayISO();
    const leftToday = (p.byDay[d] || []).filter(x => !x.done && x.id !== s.id && !(res.finished && x.itemId === s.itemId)).length;
    const allDone = s.date === d && leftToday === 0 && (p.byDay[d] || []).length > 1;
    const it = st.items[s.itemId];
    celebrate({ ...at, big: allDone || (res.finished && it?.hard) });
    const text = allDone ? 'That\'s everything for today. Proud of you.' : res.finished ? (it?.hard ? 'Deadline handled. Well done.' : pick(DONE_LINES)) : pick(PART_LINES).replace('{n}', res.part).replace('{of}', res.of);
    toast(text, { undo: res.undo, icon: 'sparkle' });
  }, [p]);

  const checkItem = useCallback(async (it, ev) => {
    const r = ev?.currentTarget?.getBoundingClientRect?.();
    if (it.status === 'done') { await setItemDone(it.id, false); return; }
    setRecent(m => ({ ...m, [it.id]: Date.now() }));
    setTimeout(() => setRecent(m => { const n = { ...m }; delete n[it.id]; return n; }), 1100);
    const res = await setItemDone(it.id, true);
    celebrate(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, big: it.hard } : { big: it.hard });
    toast(it.hard ? 'Deadline handled. Well done.' : pick(DONE_LINES), { undo: res?.undo, icon: 'sparkle' });
  }, []);

  const value = { state, local, prefs, p, today, energy, tick, surface, toast, celebrate, check, checkItem, sheet, open: (type, props = {}) => setSheet({ type, ...props }), close: () => setSheet(null), recent };
  return (
    <Ctx.Provider value={value}>
      {children}
      <div class="toasts" role="status" aria-live="polite">
        {toasts.map(t => (
          <div class="toast" key={t.id}>
            {t.icon && <span class="ti">✦</span>}<span>{t.text}</span>
            {t.undo && <button onClick={async () => { dismissToast(t.id); await t.undo(); }}>Undo</button>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/** Re-render on an interval (for clocks / timers). */
export function useNow(ms = 1000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return n;
}
export function useOnce(fn) { const r = useRef(false); useEffect(() => { if (!r.current) { r.current = true; fn(); } }, []); }
