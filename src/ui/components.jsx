import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './icons.jsx';
import { useQ, bus } from './ctx.jsx';
import { relDay, fmtMin, fmtTime, todayISO, nowMin, toMin } from '../core/dates.js';
import { calReason } from '../core/model.js';
import { mascotSVG, followPointer, cheer } from './mascot.js';
import { store } from '../core/store.js';
import { syncNow } from '../google/sync.js';

// Validated categorical palette (light + dark steps live in styles.css as --g1..--g8). Fixed order, never cycled past 8.
export const GOAL_COLORS = [1, 2, 3, 4, 5, 6, 7, 8].map(i => `var(--g${i})`);
export const goalColor = (state, id) => { const gs = Object.values(state.goals).filter(g => g && !g.del).sort((a, b) => (a.order || 0) - (b.order || 0)); const i = gs.findIndex(g => g.id === id); return GOAL_COLORS[(i < 0 ? 0 : i) % GOAL_COLORS.length]; };

export function Check({ on, onToggle, size = '', label = 'Mark done' }) {
  return (
    <button type="button" class={`check ${size} ${on ? 'on' : ''}`} role="checkbox" aria-checked={on ? 'true' : 'false'} aria-label={label} data-nodrag
      onClick={e => { e.stopPropagation(); onToggle(e); }} onPointerDown={e => e.stopPropagation()}>
      <Icon name="check" size={size === 'sm' ? 12 : 14} />
    </button>
  );
}

export function Switch({ on, onChange, label }) {
  return <label class="switch" title={label}><input type="checkbox" checked={!!on} onChange={e => onChange(e.currentTarget.checked)} aria-label={label} /><span /></label>;
}

export function Seg({ value, options, onChange }) {
  return <div class="seg">{options.map(([v, l]) => <button type="button" key={String(v)} class={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}</div>;
}

/** Chips describing an item: due date, effort, part, goals, calendar. */
export function ItemMeta({ it, s, showDue = true, today = todayISO() }) {
  const { state } = useQ();
  const bits = [];
  if (s?.of > 1) bits.push(<span class="chip">{s.n}/{s.of}</span>);
  if (s && it.kind === 'task') bits.push(<span>{fmtMin(s.minutes)}</span>);
  else if (it.kind === 'task' && it.effort) bits.push(<span>{fmtMin(it.effort)}</span>);
  if (showDue && it.due && it.kind === 'task' && (!s || it.due !== s.date || it.hard)) {
    const late = it.due < today && it.status !== 'done';
    bits.push(<span class={`chip ${late ? 'warn' : it.hard ? 'due' : ''}`}>{late ? 'Was due ' : 'Due '}{relDay(it.due, today).replace(/^Today$/, 'today').replace(/^Tomorrow$/, 'tomorrow')}{it.dueTime ? ' ' + fmtTime(it.dueTime) : ''}</span>);
  }
  if (s?.risk) bits.push(<span class="chip warn">Tight</span>);
  else if (s?.carried && s.date === today) bits.push(<span class="chip">Carried over</span>);
  if (calReason(it) && it.kind === 'task') bits.push(<span title={it.gcal?.id ? 'On your Google Calendar' : 'Will be added to Google Calendar'}><Icon name="calendar" size={13} /></span>);
  (it.goals || []).slice(0, 3).forEach(g => { const goal = state.goals[g]; if (goal && !goal.del) bits.push(<span class="row" style="gap:4px" title={goal.name}><i class="dot" style={{ background: goalColor(state, g) }} />{(it.goals.length === 1) ? <span>{goal.name.length > 22 ? goal.name.slice(0, 20) + '…' : goal.name}</span> : null}</span>); });
  if (it.steps?.chunks?.length) { const all = it.steps.chunks.flatMap(c => c.steps), d = all.filter(x => x.done).length; if (d) bits.push(<span>{d}/{all.length} steps</span>); }
  return bits.length ? <div class="meta">{bits}</div> : null;
}

/** A row in Today / day lists for a planned session. */
export function SessionRow({ s }) {
  const { state, check, open, recent, today } = useQ();
  const it = state.items[s.itemId]; if (!it) return null;
  return (
    <div class={`item ${s.done ? 'done' : ''} ${recent[s.id] ? 'just' : ''}`} data-drag={'s:' + s.id} onClick={() => open('item', { id: it.id, sid: s.id })}>
      <Check on={s.done} onToggle={e => check(s, e)} label={`Mark “${it.title}” done`} />
      <div class="grow"><div class="t">{it.title}</div><ItemMeta it={it} s={s} today={today} /></div>
    </div>
  );
}

export function EventRow({ ev, date }) {
  const { open } = useQ();
  const today = todayISO(), n = nowMin();
  const past = date === today && ev.time && (ev.endTime ? toMin(ev.endTime) : toMin(ev.time) + 60) < n;
  const now = date === today && ev.time && toMin(ev.time) <= n && !past;
  const onClick = () => ev.src === 'quiet' ? open('item', { id: ev.id }) : ev.link && window.open(ev.link, '_blank');
  return (
    <div class={`ev-row ${ev.src === 'gcal' ? 'gcal' : ''} ${past ? 'past' : ''} ${now ? 'now' : ''}`} onClick={onClick} title={ev.src === 'gcal' ? 'From Google Calendar' : ''}>
      <div class="time">{ev.time ? fmtTime(ev.time) : 'All day'}</div><div class="bar" />
      <div class="grow"><div>{ev.title}</div>{(ev.location || ev.endTime) && <div class="muted small">{ev.endTime ? `until ${fmtTime(ev.endTime)}` : ''}{ev.location ? ` · ${ev.location}` : ''}</div>}</div>
      {ev.src === 'gcal' && <span class="muted"><Icon name="google" size={13} /></span>}
    </div>
  );
}

export function Sheet({ kind = 'drawer', title, onClose, footer, children, full = false, head }) {
  const ref = useRef();
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', k);
    const prev = document.activeElement; setTimeout(() => ref.current?.querySelector('[autofocus],input,textarea,button')?.focus(), 30);
    return () => { removeEventListener('keydown', k); prev?.focus?.(); };
  }, []);
  return (
    <>
      <div class="scrim" onClick={onClose} />
      <div class={`sheet ${kind} ${full ? 'full' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div class="sh">{head || <h2>{title}</h2>}<button class="btn ghost icon" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div class="sb">{children}</div>
        {footer && <div class="sf">{footer}</div>}
      </div>
    </>
  );
}

export function Mascot({ type, size = 64, sleep = false, happy = false, className = '' }) {
  const ref = useRef();
  useEffect(() => { if (!ref.current) return; return followPointer(ref.current); }, [type]);
  useEffect(() => { const f = () => cheer(ref.current); bus.addEventListener('cheer', f); return () => bus.removeEventListener('cheer', f); }, []);
  if (type === 'none') return null;
  return <div ref={ref} class={`${className} ${sleep ? 'sleep' : ''} ${happy ? 'happy' : ''}`} dangerouslySetInnerHTML={{ __html: mascotSVG(type, { size }) }} />;
}

export function SyncPill() {
  const { local } = useQ();
  const g = local.google;
  const [busy, setBusy] = useState(false);
  if (!g?.connected) return <a class="sync-pill" href="#/you" title="Sync across devices with your Google account"><span class="dot" />On this device</a>;
  const ago = local.lastSync ? Math.round((Date.now() - local.lastSync) / 60e3) : null;
  const tap = g.needsTap || !g.token || g.exp < Date.now();
  const err = local.syncError && !tap;
  const label = busy || local.syncing ? 'Syncing…' : tap ? 'Tap to sync' : err ? 'Sync issue' : ago == null ? 'Synced' : ago < 1 ? 'Synced just now' : ago < 60 ? `Synced ${ago}m ago` : `Synced ${Math.round(ago / 60)}h ago`;
  return (
    <button class={`sync-pill ${tap ? 'tap' : err ? 'err' : 'ok'}`} title={err ? local.syncError : g.email} onClick={async () => { setBusy(true); try { await syncNow({ interactive: true }); } finally { setBusy(false); } }}>
      {busy || local.syncing ? <Icon name="refresh" size={13} className="spin" /> : <span class="dot" />}{label}
    </button>
  );
}

export function Battery({ level }) { return <span class="bat"><i style={{ width: `${[0, 22, 48, 74, 100][level] || 0}%` }} /></span>; }

export function Empty({ title, children }) { return <div class="empty"><div class="serif">{title}</div><div class="small">{children}</div></div>; }
