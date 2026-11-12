import { useMemo, useState } from 'preact/hooks';
import { useQ } from '../ctx.jsx';
import { Icon } from '../icons.jsx';
import { Sheet } from '../components.jsx';
import { planLighten, applyLighten } from '../../core/actions.js';
import { relDay, fmtMin, addDays, range } from '../../core/dates.js';
import { dayLoad } from '../../core/planner.js';

export function Lighten({ day: initial }) {
  const q = useQ(), { state, p, today } = q;
  const [day, setDay] = useState(initial || today);
  const prop = useMemo(() => planLighten(p, day, state.items), [p, day]);
  const [off, setOff] = useState({});
  const chosen = { ...prop, moves: prop.moves.filter(m => !off[m.s.id]) };
  chosen.after = prop.before - chosen.moves.reduce((a, m) => a + m.s.minutes, 0);
  const evs = p.busy[day]?.events || [];
  const stuck = (p.byDay[day] || []).filter(s => !s.done && !prop.moves.some(m => m.s.id === s.id));
  return (
    <Sheet kind="modal" title={`Lighten ${relDay(day, today).toLowerCase()}`} onClose={q.close} footer={<>
      <span class="small muted grow">{fmtMin(prop.before)} → {fmtMin(chosen.after)} of tasks</span>
      <button class="btn" onClick={q.close}>Not now</button>
      <button class="btn primary" disabled={!chosen.moves.length} onClick={async () => { const r = await applyLighten(day, chosen); q.close(); q.toast(`${relDay(day, today)} is lighter now. Breathe.`, { undo: r.undo }); }}>Move {chosen.moves.length || ''} {chosen.moves.length === 1 ? 'thing' : 'things'}</button></>}>
      <div class="seg" style="margin-bottom:14px">{range(today, addDays(today, 6)).map(d => <button key={d} class={d === day ? 'on' : ''} onClick={() => { setDay(d); setOff({}); }}>{relDay(d, today)}<span class="muted" style="margin-left:6px">{dayLoad(p, d).label}</span></button>)}</div>
      {prop.moves.length ? <>
        <p class="small" style="margin:0 0 10px">These can wait — each still lands before it's due, on a lighter day.</p>
        {prop.moves.map(m => <label class="res-row" key={m.s.id} style="cursor:pointer"><input type="checkbox" checked={!off[m.s.id]} onChange={() => setOff(o => ({ ...o, [m.s.id]: !o[m.s.id] }))} /><span class="grow">{m.it.title}<span class="muted small"> · {fmtMin(m.s.minutes)}</span></span><span class="where">→ {relDay(m.to, today)}</span></label>)}
      </> : <p class="small">Nothing on this day can safely move — it's all due very soon. {stuck.length ? 'If it\'s still too much, open a task and make it smaller, or ask for an extension. You don\'t have to do everything perfectly.' : 'This day is already light.'}</p>}
      {stuck.length > 0 && prop.moves.length > 0 && <p class="small muted" style="margin-top:12px">Staying on {relDay(day, today).toLowerCase()}: {stuck.map(s => state.items[s.itemId]?.title).filter(Boolean).join(', ')}.</p>}
      {evs.filter(e => e.time).length > 0 && <p class="small muted" style="margin-top:8px">You also have {evs.filter(e => e.time).length} event{evs.length > 1 ? 's' : ''}. I can't move those, but if one is optional, skipping it is allowed.</p>}
      <p class="small muted" style="margin-top:8px">I'll also keep this day's room smaller, so new things don't fill it back up.</p>
    </Sheet>
  );
}
