import { useEffect, useState } from 'preact/hooks';
import { useQ } from '../ctx.jsx';
import { Icon } from '../icons.jsx';
import { Check, ItemMeta, Empty } from '../components.jsx';
import { addDays, mondayOf, pd, DOW, MON, MON_LONG, fmtMin, fmtTime, iso, relDay, range } from '../../core/dates.js';
import { dayLoad } from '../../core/planner.js';
import { offlineExtract, toItems } from '../../core/extract.js';
import { addItems, pinItemToDay } from '../../core/actions.js';
import { store } from '../../core/store.js';

export function Plan() {
  const q = useQ(), { p, today } = q;
  const hashDay = (location.hash.match(/d=(\d{4}-\d{2}-\d{2})/) || [])[1];
  const [view, setView] = useState(store.local.ui?.planView || 'week');
  const [anchor, setAnchor] = useState(hashDay || today);
  const [sel, setSel] = useState(hashDay || today); // mobile: selected day
  useEffect(() => { store.setLocal(l => ({ ui: { ...(l.ui || {}), planView: view } })); }, [view]);
  const ws = mondayOf(anchor);
  const step = n => { if (view === 'week') { setAnchor(addDays(anchor, 7 * n)); setSel(addDays(sel, 7 * n)); } else { const d = pd(anchor); d.setMonth(d.getMonth() + n, 1); setAnchor(iso(d)); } };
  useEffect(() => {
    const k = e => { if (e.target.closest('input,textarea') || document.querySelector('.sheet')) return; if (e.key === 'ArrowLeft') step(-1); if (e.key === 'ArrowRight') step(1); if (e.key === 't') { setAnchor(today); setSel(today); } };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  });
  const a = pd(ws), z = pd(addDays(ws, 6));
  const title = view === 'week' ? (a.getMonth() === z.getMonth() ? `${a.getDate()} – ${z.getDate()} ${MON[a.getMonth()]}` : `${a.getDate()} ${MON[a.getMonth()]} – ${z.getDate()} ${MON[z.getMonth()]}`) : `${MON_LONG[pd(anchor).getMonth()]} ${pd(anchor).getFullYear()}`;
  const days = range(ws, addDays(ws, 6));
  const weekTotal = days.reduce((s, d) => s + dayLoad(p, d).planned, 0);

  return (
    <div class="page wide">
      <div class="toolbar">
        <button class="btn icon" onClick={() => step(-1)} aria-label="Previous"><Icon name="left" /></button>
        <button class="btn" onClick={() => { setAnchor(today); setSel(today); }}>Today</button>
        <button class="btn icon" onClick={() => step(1)} aria-label="Next"><Icon name="right" /></button>
        <span class="title">{title}</span>
        {view === 'week' && <span class="muted small">{fmtMin(weekTotal)} planned</span>}
        <span class="grow" />
        <button class="btn ghost" onClick={() => q.open('lighten', { day: sel >= today ? sel : today })} title="Move what can wait off a busy day"><Icon name="leaf" size={16} />Lighten a day</button>
        <div class="pill-toggle"><button class={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>Week</button><button class={view === 'month' ? 'on' : ''} onClick={() => setView('month')}>Month</button></div>
      </div>
      {view === 'week' ? (
        <>
          <div class="week">{days.map(d => <DayCol key={d} d={d} />)}</div>
          <div class="daystrip">{days.map(d => { const l = dayLoad(p, d), n = Math.min(4, Math.ceil(l.planned / 60)); return (
            <button key={d} data-drop={'day:' + d} class={`${d === sel ? 'on' : ''} ${d === today ? 'today' : ''}`} onClick={() => setSel(d)}>
              {DOW[pd(d).getDay()]}<b>{pd(d).getDate()}</b><span class="lds">{Array.from({ length: n }, (_, i) => <i key={i} />)}</span>
            </button>); })}</div>
          <div class="mobile-day"><DayCol d={sel} mobile /></div>
          <div class="muted small" style="margin-top:10px">Drag tasks between days{matchMedia('(pointer: coarse)').matches ? ' (press and hold, then drag onto a day above)' : ''}. Events and deadlines go to Google Calendar; flexible work stays here.</div>
        </>
      ) : <Month anchor={anchor} onPick={d => { setAnchor(d); setSel(d); setView('week'); }} />}
    </div>
  );
}

function DayCol({ d, mobile }) {
  const q = useQ(), { state, p, today } = q;
  const l = dayLoad(p, d), dt = pd(d);
  const evs = p.busy[d]?.events || [];
  const dl = Object.values(state.items).filter(i => i && !i.del && i.kind === 'task' && i.due === d && (i.hard || i.dueTime));
  const ss = (p.byDay[d] || []).slice().sort((a, b) => a.done - b.done);
  const [adding, setAdding] = useState(false);
  const add = async v => {
    v = v.trim(); setAdding(false); if (!v) return;
    const ex = offlineExtract(v, Object.values(state.goals).filter(g => g && !g.del), today);
    const its = toItems(ex, []); if (!its.length) return;
    its.forEach(i => { if (i.kind === 'event' && !i.date) i.date = d; });
    const r = await addItems(its);
    for (const i of its) if (i.kind === 'task' && (!i.due || i.due >= d)) await pinItemToDay(i.id, d);
    q.toast(`Added to ${relDay(d, today)}.`, { undo: r.undo });
  };
  const capPct = Math.min(100, l.cap ? (l.planned / l.cap) * 100 : l.planned ? 100 : 0);
  return (
    <div class={`daycol ${d === today ? 'today' : ''} ${d < today ? 'past' : ''} ${mobile ? 'mobile' : ''}`} data-drop={'day:' + d}>
      {!mobile && <div class="dh"><span class="dn">{DOW[dt.getDay()]}</span><span class="dd">{dt.getDate()}</span><span class="ld" title={`${fmtMin(l.planned)} planned · room for ${fmtMin(l.cap)}`}>{l.planned ? fmtMin(l.planned) : l.label === 'Rest' ? 'Rest' : ''}</span></div>}
      {mobile && <div class="section-h" style="margin:4px 0 8px"><h2>{relDay(d, today)}</h2><span class="muted">{l.label}{l.planned ? ` · ${fmtMin(l.planned)}` : ''}</span></div>}
      <div class={`cap ${l.label === 'Over' ? 'over' : ''}`}><i style={{ width: capPct + '%' }} /></div>
      {dl.map(i => <div key={'dl' + i.id} class="mini dl" onClick={() => q.open('item', { id: i.id })}><Icon name="flag" size={13} /><span class="grow">{i.dueTime ? fmtTime(i.dueTime) + ' · ' : 'Due · '}{i.title}</span></div>)}
      {evs.map(e => (
        <div key={e.id + d} class={`mini ${e.src === 'gcal' ? 'gc' : 'ev'}`} data-drag={e.src === 'quiet' ? 'e:' + e.id : undefined} onClick={() => e.src === 'quiet' ? q.open('item', { id: e.id }) : e.link && open(e.link, '_blank')} title={e.src === 'gcal' ? 'From Google Calendar' : ''}>
          <div class="grow"><div class="tm">{e.time ? fmtTime(e.time) + (e.endTime ? '–' + fmtTime(e.endTime) : '') : 'All day'}</div><div>{e.title}</div></div>
        </div>
      ))}
      {ss.map(s => { const it = state.items[s.itemId]; if (!it) return null; return (
        <div key={s.id} class={`mini ${s.done ? 'done' : ''} ${s.risk ? 'risk' : ''}`} data-drag={'s:' + s.id} onClick={() => q.open('item', { id: it.id, sid: s.id })}>
          <Check size="sm" on={s.done} onToggle={e => q.check(s, e)} label={`Mark “${it.title}” done`} />
          <div class="grow"><div class="t">{it.title}</div><div class="mt">{s.of > 1 && <span>{s.n}/{s.of}</span>}<span>{fmtMin(s.minutes)}</span>{it.due && it.due !== d && <span style={{ color: it.hard ? 'var(--due)' : '' }}>due {relDay(it.due, today).toLowerCase()}</span>}{s.risk && <span style="color:var(--warn)">tight</span>}</div></div>
        </div>); })}
      {mobile && !ss.length && !evs.length && !dl.length && <Empty title={l.label === 'Rest' ? 'Rest day.' : 'Nothing here yet.'}>{l.label === 'Rest' ? 'Rest is part of the plan.' : 'Tap below to add something.'}</Empty>}
      {d >= today && (adding
        ? <input class="qadd" autofocus placeholder="Add a task or event…" onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = ''; e.currentTarget.blur(); } }} onBlur={e => add(e.currentTarget.value)} />
        : <button class="add" onClick={() => setAdding(true)}>+ Add</button>)}
    </div>
  );
}

function Month({ anchor, onPick }) {
  const { state, p, today } = useQ();
  const first = pd(anchor); first.setDate(1);
  const start = mondayOf(iso(first)), month = first.getMonth();
  const cells = range(start, addDays(start, 41));
  const dl = {};
  Object.values(state.items).forEach(i => { if (i && !i.del && i.kind === 'task' && i.hard && i.due && i.status !== 'done') (dl[i.due] = dl[i.due] || []).push(i); });
  return (
    <div class="month">
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div class="mh" key={d}>{d}</div>)}
      {cells.map(d => { const dt = pd(d), evs = p.busy[d]?.events || [], l = dayLoad(p, d), chips = [...(dl[d] || []).map(i => ({ c: 'dl', t: i.title })), ...evs.map(e => ({ c: e.src === 'gcal' ? 'gc' : '', t: (e.time ? fmtTime(e.time) + ' ' : '') + e.title }))]; return (
        <div key={d} class={`mc ${dt.getMonth() !== month ? 'out' : ''} ${d === today ? 'today' : ''}`} onClick={() => onPick(d)} data-drop={'day:' + d}>
          <span class="n">{dt.getDate()}</span>
          {chips.slice(0, 3).map((c, i) => <span key={i} class={`e ${c.c}`}>{c.t}</span>)}
          {chips.length > 3 && <span class="muted tiny">+{chips.length - 3} more</span>}
          {l.planned > 0 && <span class="ld" style={{ width: Math.min(100, (l.planned / Math.max(l.cap, 60)) * 100) + '%' }} title={fmtMin(l.planned) + ' of tasks'} />}
        </div>); })}
    </div>
  );
}
