import { useEffect, useState } from 'preact/hooks';
import { useQ } from '../ctx.jsx';
import { Icon } from '../icons.jsx';
import { Sheet, Switch, Seg, Check, goalColor } from '../components.jsx';
import { updateItem, deleteItem, moveSession, pinItemToDay, setItemDone } from '../../core/actions.js';
import { chunkify } from '../../core/chunk.js';
import { canChunk } from '../../core/wellbeing.js';
import { calReason, CAL_REASON_TEXT, SMALL_TASK } from '../../core/model.js';
import { relDay, fmtMin, todayISO, addDays } from '../../core/dates.js';
import { readFile } from '../../core/files.js';
import { aiReady } from '../../core/llm.js';

const EFFORTS = [[10, '10m'], [15, '15m'], [30, '30m'], [45, '45m'], [60, '1h'], [90, '1.5h'], [120, '2h'], [180, '3h'], [240, '4h'], [360, '6h'], [480, '8h']];

export function ItemDetail({ id, sid, steps: openSteps }) {
  const q = useQ(), { state, p, today, energy } = q;
  const it = state.items[id];
  const [title, setTitle] = useState(it?.title || '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (it) setTitle(it.title); }, [it?.title]);
  useEffect(() => { if (openSteps && it && canChunk(it) && !it.steps && aiReady()) makeSteps(); }, []);
  if (!it || it.del) return null;
  const up = f => updateItem(id, f);
  const sessions = p.sessions.filter(s => s.itemId === id).sort((a, b) => a.date.localeCompare(b.date));
  const goals = Object.values(state.goals).filter(g => g && !g.del);
  const reason = calReason({ ...it, cal: null }), onCal = calReason(it);
  const cur = sessions.find(s => s.id === sid) || sessions.find(s => !s.done);
  const doneMin = sessions.filter(s => s.done).reduce((a, s) => a + s.minutes, 0);

  async function makeSteps(smaller = false) {
    setBusy(true);
    const r = await chunkify(it, { minutes: cur?.minutes || it.effort, energy, smaller, attachText: (it.attach || []).map(a => a.text).join('\n\n') });
    setBusy(false);
    if (r) await up({ steps: r });
    if (r?.offline && r.error) q.toast('AI unavailable — used simple steps.');
  }
  const stepToggle = async (ci, si, e) => {
    const steps = JSON.parse(JSON.stringify(it.steps)); const st = steps.chunks[ci].steps[si]; st.done = !st.done;
    await up({ steps });
    if (st.done) {
      const chunkDone = steps.chunks[ci].steps.every(x => x.done);
      const r = e?.currentTarget?.getBoundingClientRect?.();
      if (chunkDone) { q.celebrate(r ? { x: r.left, y: r.top } : {}); q.toast(ci === steps.chunks.length - 1 ? 'Every step done. Mark the task done?' : 'Chunk done. Stretch, sip some water, then the next one.'); }
    }
  };

  const footer = <>
    <button class="btn ghost danger" onClick={async () => { const r = await deleteItem(id); q.close(); q.toast('Deleted.', { undo: r?.undo }); }}><Icon name="trash" size={15} />Delete</button>
    <span class="grow" />
    {it.kind === 'task' && it.status !== 'done' && <button class="btn" onClick={() => q.open('focus', { itemId: id, sid: cur?.id })}><Icon name="play" size={14} />Focus</button>}
    {it.kind === 'task' && <button class={`btn ${it.status === 'done' ? '' : 'primary'}`} onClick={async e => { await q.checkItem(it, e); if (it.status !== 'done') q.close(); }}><Icon name="check" size={15} />{it.status === 'done' ? 'Mark not done' : 'Done'}</button>}
  </>;

  return (
    <Sheet kind="drawer" title="" onClose={q.close} footer={footer} head={<div class="row grow">{it.kind === 'task' && <Check on={it.status === 'done'} onToggle={e => q.checkItem(it, e)} />}<span class="muted small">{it.kind === 'event' ? 'Event' : it.status === 'done' ? 'Done' : 'Task'}</span></div>}>
      <textarea class="input bare serif" rows="2" style="font-size:22px;line-height:1.3;resize:none;width:100%;margin-bottom:14px" value={title} onInput={e => setTitle(e.currentTarget.value)} onBlur={() => title.trim() && title !== it.title && up({ title: title.trim() })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} aria-label="Title" />

      <div class="field"><span class="label">Type</span><Seg value={it.kind} options={[['task', 'Task'], ['event', 'Event']]} onChange={v => up(v === 'event' ? { kind: 'event', date: it.date || it.due || today, time: it.time || it.dueTime } : { kind: 'task', due: it.due || it.date, effort: it.effort || 30 })} /></div>

      {it.kind === 'task' ? <>
        <div class="field"><span class="label">Due</span>
          <div class="row wrap"><input type="date" class="input" style="width:auto" value={it.due || ''} onChange={e => up({ due: e.currentTarget.value || null })} />
            <input type="time" class="input" style="width:auto" value={it.dueTime || ''} onChange={e => up({ dueTime: e.currentTarget.value || null })} title="Optional time" />
            {it.due && <button class="btn sm ghost" onClick={() => up({ due: null, dueTime: null, hard: false })}>Clear</button>}</div>
          {it.due && <label class="row small" style="margin-top:4px"><Switch on={it.hard} onChange={v => up({ hard: v })} label="Hard deadline" /> Hard deadline — can't slip (submission, application, fee)</label>}
        </div>
        <div class="field"><span class="label">How long it'll take in total</span>
          <Seg value={EFFORTS.some(([v]) => v === it.effort) ? it.effort : null} options={EFFORTS} onChange={v => up({ effort: v, load: v <= 30 ? 'light' : it.load })} />
          {!EFFORTS.some(([v]) => v === it.effort) && <span class="small muted">{fmtMin(it.effort)}</span>}
        </div>
        <div class="field"><span class="label">Kind of effort</span><Seg value={it.load} options={[['light', 'Light'], ['medium', 'Medium'], ['deep', 'Deep focus']]} onChange={v => up({ load: v })} /></div>
      </> : <>
        <div class="field"><span class="label">When</span>
          <div class="row wrap"><input type="date" class="input" style="width:auto" value={it.date || ''} onChange={e => up({ date: e.currentTarget.value || null })} />
            <input type="time" class="input" style="width:auto" value={it.time || ''} onChange={e => up({ time: e.currentTarget.value || null })} /><span class="muted">to</span>
            <input type="time" class="input" style="width:auto" value={it.endTime || ''} onChange={e => up({ endTime: e.currentTarget.value || null })} /></div>
          <label class="small row" style="margin-top:4px">Ends on <input type="date" class="input" style="width:auto" value={it.endDate || ''} onChange={e => up({ endDate: e.currentTarget.value || null })} /> <span class="muted">(multi-day, e.g. a conference)</span></label>
        </div>
        <div class="field"><span class="label">Where</span><input class="input" value={it.location || ''} placeholder="Room, link or place" onChange={e => up({ location: e.currentTarget.value })} /></div>
      </>}

      <div class="field"><span class="label">Google Calendar</span>
        <div class="row"><Switch on={!!onCal} onChange={v => up({ cal: v === !!reason ? null : v })} label="On Google Calendar" />
          <span class="small">{onCal ? (it.cal === true ? 'You asked for this one to be on your calendar.' : `On your calendar because ${CAL_REASON_TEXT[reason]}.`) : reason ? 'Kept off your calendar.' : 'Flexible work stays on your list, not your calendar.'}</span></div>
        {it.gcal?.link && <a class="small" href={it.gcal.link} target="_blank" rel="noreferrer">Open in Google Calendar</a>}
      </div>

      {goals.length > 0 && <div class="field"><span class="label">Moves me toward</span>
        <div class="seg">{goals.map(g => { const on = (it.goals || []).includes(g.id); return <button key={g.id} class={on ? 'on' : ''} onClick={() => up({ goals: on ? it.goals.filter(x => x !== g.id) : [...(it.goals || []), g.id] })}><i class="dot" style={{ background: goalColor(state, g.id), marginRight: '6px' }} />{g.name}</button>; })}</div>
        {!(it.goals || []).length && it.kind === 'task' && <span class="small muted">Not tied to a goal. That's fine for chores — but if it's neither due nor meaningful, maybe it can go.</span>}
      </div>}

      {it.kind === 'task' && it.status !== 'done' && <div class="field"><span class="label">Plan</span>
        {sessions.length ? <div class="list">{sessions.map(s => (
          <div class={`item ${s.done ? 'done' : ''}`} key={s.id} style="padding:6px 10px;cursor:default">
            <Check size="sm" on={s.done} onToggle={e => q.check(s, e)} />
            <div class="grow"><div class="t">{relDay(s.date, today)}{s.of > 1 ? ` · part ${s.n}/${s.of}` : ''}</div><div class="meta">{fmtMin(s.minutes)}{s.risk ? ' · tight' : ''}{s.pinned ? ' · you placed this' : ''}</div></div>
            {!s.done && <input type="date" class="input" style="width:auto;height:30px;padding:2px 6px" value={s.date} min={today} onChange={async e => { const v = e.currentTarget.value; if (!v) return; const r = await moveSession(s, v); q.toast(r?.late ? 'Moved — that\'s after it\'s due.' : `Moved to ${relDay(v, today)}.`, { undo: r?.undo }); }} aria-label="Move to day" />}
          </div>))}</div>
          : <div class="row small"><span class="muted grow">{it.due ? 'Nothing left to schedule.' : 'No date — it waits in Anytime.'}</span><span>Do it on</span><input type="date" class="input" style="width:auto;height:30px" min={today} onChange={async e => { const v = e.currentTarget.value; if (v) { await pinItemToDay(id, v); q.toast(`Planned for ${relDay(v, today)}.`); } }} /></div>}
        {it.effort >= 120 && <div class="small muted" style="margin-top:6px">{fmtMin(doneMin)} of {fmtMin(it.effort)} done. Big tasks are spread over days so no single day gets crushed.</div>}
      </div>}

      {it.kind === 'task' && (canChunk(it) ? (
        <div class="field"><span class="label">Steps</span>
          {busy ? <div class="small muted">Making it smaller…</div> : !it.steps ? <div class="row wrap"><button class="btn" onClick={() => makeSteps()}><Icon name="steps" size={15} />Break it into steps</button><span class="small muted">{(it.attach || []).length ? 'Using your attached file.' : 'Attach the assignment for better steps.'}</span></div> : <Steps it={it} onToggle={stepToggle} onNext={() => { const s2 = JSON.parse(JSON.stringify(it.steps)); s2.cur = Math.min(s2.cur + 1, s2.chunks.length - 1); up({ steps: s2 }); }} onSmaller={() => makeSteps(true)} />}
        </div>
      ) : it.effort < SMALL_TASK && it.status !== 'done' && <div class="small muted" style="margin-bottom:16px">Small task — no need to plan it. Just do it when you have {fmtMin(it.effort)}.</div>)}

      <div class="field"><span class="label">Files</span>
        {(it.attach || []).map((a, i) => <div class="row small" key={i}><Icon name="clip" size={14} /><span class="grow">{a.name}</span><button class="btn ghost icon sm" aria-label="Remove file" onClick={() => up({ attach: it.attach.filter((_, j) => j !== i) })}><Icon name="x" size={13} /></button></div>)}
        <label class="btn sm" style="align-self:flex-start"><Icon name="clip" size={14} />Attach (PDF, Word, text)<input type="file" class="sr" accept=".pdf,.docx,.txt,.md" onChange={async e => { const f = e.currentTarget.files[0]; if (!f) return; try { const r = await readFile(f); if (r.image) throw new Error('Photos work in the brain dump; here use a document'); await up({ attach: [...(it.attach || []), { name: r.name, text: r.text }], steps: null }); q.toast('Attached. Steps will use it.'); } catch (err) { q.toast(err.message); } }} /></label>
      </div>
      <div class="field"><span class="label">Notes</span><textarea class="textarea" value={it.notes} placeholder="Anything useful — links, requirements, who to ask" onChange={e => up({ notes: e.currentTarget.value })} /></div>
    </Sheet>
  );
}

export function Steps({ it, onToggle, onNext, onSmaller, compact = false }) {
  const s = it.steps, ch = s.chunks[s.cur]; if (!ch) return null;
  const all = ch.steps.every(x => x.done);
  return (
    <div class="card pad" style="background:var(--surface-2);border:0">
      <div class="small muted">Chunk {s.cur + 1} of {s.chunks.length}</div>
      <div class="serif" style="font-size:17px;margin:2px 0 6px">{ch.title}</div>
      {ch.steps.map((x, i) => <label class="row" key={i} style="padding:5px 0;align-items:flex-start;cursor:pointer"><Check size="sm" on={x.done} onToggle={e => onToggle(s.cur, i, e)} /><span style={{ opacity: x.done ? .5 : 1, textDecoration: x.done ? 'line-through' : 'none' }}>{x.t}</span></label>)}
      {all && s.cur < s.chunks.length - 1 && <button class="btn sm primary" style="margin-top:8px" onClick={onNext}>Next chunk</button>}
      {!compact && s.chunks.slice(s.cur + 1).map((c, i) => <div class="small muted" key={i} style="margin-top:4px">Later: {c.title}</div>)}
      {!compact && onSmaller && <button class="btn sm ghost" style="margin-top:8px" onClick={onSmaller}>Make it even smaller</button>}
    </div>
  );
}
