import { useState } from 'preact/hooks';
import { useQ } from '../ctx.jsx';
import { Icon } from '../icons.jsx';
import { goalColor } from '../components.jsx';
import { weekSummary } from '../../core/wellbeing.js';
import { mondayOf, addDays, fmtMin, shortDate, todayISO, range } from '../../core/dates.js';
import { llmJSON, aiReady } from '../../core/llm.js';
import { store } from '../../core/store.js';
import { setItemDone, deleteItem, updateItem } from '../../core/actions.js';

const ENERGY_LABEL = ['', 'Low', 'Okay', 'Good', 'Great'];

export function Week() {
  const q = useQ(), { state, prefs, p, today } = q;
  const [ws, setWs] = useState(mondayOf(today));
  const w = weekSummary(state, prefs, p, ws);
  const noteId = 'wk-' + ws, note = state.notes[noteId] && !state.notes[noteId].del ? state.notes[noteId] : { id: noteId };
  const [busy, setBusy] = useState(false);
  const isThis = ws === mondayOf(today);
  const reflect = async () => {
    setBusy(true);
    try {
      const facts = { done: w.doneItems.map(i => i.title).slice(0, 30), work: fmtMin(w.workMin), heavyDays: w.heavyDays, lateNights: w.lateNights, energy: w.energy.map((e, i) => `${w.days[i].dow}:${e ? ENERGY_LABEL[e] : '-'}`).join(' '), goals: w.perGoal.map(g => `${g.goal.name}: ${fmtMin(g.minutes)}, ${g.done} done`), habits: w.habits.map(h => `${h.h.name} ${h.count}/${h.h.perWeek}`), unalignedWork: fmtMin(w.unalignedMin) };
      const r = await llmJSON({ system: 'You are a warm, grounded friend who helps a student reflect on their week. No toxic positivity, no lecturing.', prompt: `Here is the student's week:\n${JSON.stringify(facts)}\nWrite (1) "reflection": 3-4 short sentences in second person that notice what went well, name anything heavy kindly, and point out how their time matched (or didn't match) their goals; (2) "suggestion": one small, specific, kind suggestion for next week. Reply ONLY as JSON {"reflection":"","suggestion":""}.`, maxTokens: 1200 });
      await store.put('notes', { ...note, ai: r.reflection, suggestion: r.suggestion, aiAt: Date.now() });
    } catch (e) { q.toast(e.message); } finally { setBusy(false); }
  };
  const maxDay = Math.max(60, ...w.days.map(d => Math.max(d.plannedMin, d.doneMin)));
  const maxGoal = Math.max(30, ...w.perGoal.map(g => g.minutes), w.unalignedMin);

  return (
    <div class="page">
      <div class="page-head">
        <h1>Your week</h1>
        <span class="grow" />
        <button class="btn icon" onClick={() => setWs(addDays(ws, -7))} aria-label="Previous week"><Icon name="left" /></button>
        <span class="muted small">{shortDate(ws)} – {shortDate(addDays(ws, 6))}</span>
        <button class="btn icon" disabled={isThis} onClick={() => setWs(addDays(ws, 7))} aria-label="Next week"><Icon name="right" /></button>
      </div>

      <div class="stats">
        <div class="stat"><b>{w.doneCount}</b><span>things done</span></div>
        <div class="stat"><b>{fmtMin(w.workMin)}</b><span>of work finished</span></div>
        <div class="stat"><b>{fmtMin(w.focusMin)}</b><span>in focus sessions</span></div>
        <div class="stat"><b>{w.heavyDays}</b><span>heavy day{w.heavyDays === 1 ? '' : 's'}{w.lateNights ? ` · ${w.lateNights} late night${w.lateNights > 1 ? 's' : ''}` : ''}</span></div>
      </div>

      <div class="section card pad">
        <div class="section-h"><h2>Reflection</h2></div>
        {note.ai ? <><p class="reflection" style="margin:0 0 10px">{note.ai}</p>{note.suggestion && <p class="small" style="margin:0"><b>For next week:</b> {note.suggestion}</p>}</>
          : <p class="muted small" style="margin:0 0 8px">{aiReady() ? 'A short, kind look back at your week.' : 'Add an AI key in You → AI to get a written reflection. The numbers below work without it.'}</p>}
        {aiReady() && <button class="btn sm" style="margin-top:10px" disabled={busy} onClick={reflect}><Icon name="sparkle" size={14} />{busy ? 'Thinking…' : note.ai ? 'Write it again' : 'Reflect on my week'}</button>}
        <div class="field" style="margin:14px 0 0"><span class="label">In your own words</span>
          <textarea class="textarea" style="min-height:70px" placeholder="What gave you energy this week? What drained it?" value={note.text || ''} onChange={e => store.put('notes', { ...note, text: e.currentTarget.value })} /></div>
      </div>

      <div class="section card pad">
        <div class="section-h"><h2>Work by day</h2><span class="muted">minutes of tasks</span></div>
        <DayBars days={w.days} max={maxDay} />
        <div class="legend" style="margin-top:14px"><span><i style="background:var(--accent)" />Done</span><span><i style="background:color-mix(in srgb,var(--accent) 30%,transparent)" />Planned, not done</span></div>
      </div>

      <div class="section card pad">
        <div class="section-h"><h2>Energy</h2><span class="muted">from your check-ins</span></div>
        {w.energy.some(Boolean) ? <EnergyLine days={w.days} energy={w.energy} /> : <div class="muted small">No check-ins this week. Tap your energy on Today — one tap is enough.</div>}
      </div>

      <div class="section card pad">
        <div class="section-h"><h2>Time toward your goals</h2></div>
        {w.perGoal.length ? <>
          {w.perGoal.map(g => <div class="goalbar" key={g.goal.id}><span class="row" style="width:40%;min-width:120px"><i class="dot" style={{ background: goalColor(state, g.goal.id) }} /><span class="small">{g.goal.name}</span></span><div class="track"><i style={{ width: (g.minutes / maxGoal * 100) + '%', background: goalColor(state, g.goal.id) }} /></div><span class="small" style="width:64px;text-align:right">{fmtMin(g.minutes)}</span></div>)}
          <div class="goalbar"><span class="row" style="width:40%;min-width:120px"><i class="dot" style="background:var(--ink-4)" /><span class="small muted">Not tied to a goal</span></span><div class="track"><i style={{ width: (w.unalignedMin / maxGoal * 100) + '%', background: 'var(--ink-4)' }} /></div><span class="small" style="width:64px;text-align:right">{fmtMin(w.unalignedMin)}</span></div>
          {w.perGoal.filter(g => !g.minutes).length > 0 && <p class="small muted" style="margin:10px 0 0">Nothing went toward {w.perGoal.filter(g => !g.minutes).map(g => `“${g.goal.name}”`).join(', ')} this week. That's okay — would one small step next week help?</p>}
        </> : <div class="muted small">Add what matters to you in <a href="#/you">You</a> and I'll show where your time goes.</div>}
      </div>

      {w.habits.length > 0 && (
        <div class="section card pad">
          <div class="section-h"><h2>Habits</h2></div>
          {w.habits.map(({ h, count }) => (
            <div class="goalbar" key={h.id}><span class="small" style="width:34%;min-width:110px">{h.name}</span>
              <span class="row" style="gap:5px">{range(ws, addDays(ws, 6)).map(d => { const on = state.habitLogs[`${h.id}@${d}`] && !state.habitLogs[`${h.id}@${d}`].del; return <i key={d} title={d} style={{ width: '14px', height: '14px', borderRadius: '50%', display: 'inline-block', background: on ? 'var(--accent)' : 'var(--surface-2)', border: on ? 'none' : '1px solid var(--line-2)' }} />; })}</span>
              <span class="small" style="margin-left:auto">{count}/{h.perWeek}{count >= h.perWeek ? ' ✓' : ''}</span></div>
          ))}
        </div>
      )}

      {isThis && w.reconsider.length > 0 && (
        <div class="section card pad">
          <div class="section-h"><h2>Worth reconsidering</h2></div>
          <p class="small muted" style="margin:0 0 8px">No deadline, not tied to any goal, and sitting here for a while. Do they still deserve space in your head?</p>
          {w.reconsider.map(i => (
            <div class="res-row" key={i.id}><span class="grow">{i.title}</span>
              <button class="btn sm ghost" onClick={async () => { const r = await deleteItem(i.id); q.toast('Let go. One less thing.', { undo: r?.undo }); }}>Let it go</button>
              <button class="btn sm ghost" onClick={() => updateItem(i.id, { created: Date.now() })}>Keep</button>
              <button class="btn sm" onClick={() => q.open('item', { id: i.id })}>Plan it</button></div>
          ))}
        </div>
      )}
    </div>
  );
}

function DayBars({ days, max }) {
  const [tip, setTip] = useState(null);
  const H = 108;
  return (
    <div class="chart" onMouseLeave={() => setTip(null)}>
      <div class="bars" role="img" aria-label={days.map(d => `${d.dow}: ${fmtMin(d.doneMin)} done of ${fmtMin(Math.max(d.plannedMin, d.doneMin))}`).join('; ')}>
        {days.map((d, i) => {
          const rest = Math.max(0, d.plannedMin - d.doneMin), hDone = d.doneMin / max * H, hRest = rest / max * H;
          return (
            <div class="b" key={d.d} onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(), pr = e.currentTarget.parentElement.getBoundingClientRect(); setTip({ x: r.left - pr.left + r.width / 2, y: H - hDone - hRest + 8, text: `${d.dow}: ${fmtMin(d.doneMin)} done${rest ? `, ${fmtMin(rest)} not done` : ''}${d.eventsMin ? ` · ${fmtMin(d.eventsMin)} of events` : ''}` }); }}>
              <div class="v" style={{ height: (hDone + hRest + (hDone && hRest ? 2 : 0)) + 'px', gap: hDone && hRest ? '2px' : 0 }}>
                {hDone > 0 && <i style={{ height: hDone + 'px', background: 'var(--accent)', borderRadius: hRest ? '0' : '4px 4px 0 0' }} />}
                {hRest > 0 && <i style={{ height: hRest + 'px', background: 'color-mix(in srgb,var(--accent) 30%,transparent)', borderRadius: '4px 4px 0 0' }} />}
              </div>
              <span>{d.dow}</span>
            </div>
          );
        })}
      </div>
      {tip && <div class="tip" style={{ left: tip.x + 'px', top: tip.y + 'px' }}>{tip.text}</div>}
    </div>
  );
}

function EnergyLine({ days, energy }) {
  const W = 560, H = 140, padL = 46, padR = 14, padT = 12, padB = 26;
  const x = i => padL + i * (W - padL - padR) / 6, y = v => padT + (4 - v) * (H - padT - padB) / 3;
  const segs = []; let cur = [];
  energy.forEach((v, i) => { if (v) cur.push([x(i), y(v)]); else if (cur.length) { segs.push(cur); cur = []; } });
  if (cur.length) segs.push(cur);
  const [tip, setTip] = useState(null);
  return (
    <div class="chart" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={'Energy by day: ' + days.map((d, i) => `${d.dow} ${energy[i] ? ENERGY_LABEL[energy[i]] : 'no check-in'}`).join(', ')}>
        {[1, 2, 3, 4].map(v => <g key={v}><line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="var(--line)" stroke-width="1" /><text x={padL - 8} y={y(v) + 4} text-anchor="end" font-size="11" fill="var(--ink-3)">{ENERGY_LABEL[v]}</text></g>)}
        {days.map((d, i) => <text key={d.d} x={x(i)} y={H - 6} text-anchor="middle" font-size="11" fill="var(--ink-3)">{d.dow}</text>)}
        {segs.map((s, k) => <polyline key={k} points={s.map(p => p.join(',')).join(' ')} fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />)}
        {energy.map((v, i) => v ? <g key={i}><circle cx={x(i)} cy={y(v)} r="4.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2" /><circle cx={x(i)} cy={y(v)} r="14" fill="transparent" onMouseEnter={() => setTip({ x: x(i) / W * 100, y: y(v), text: `${days[i].dow}: ${ENERGY_LABEL[v]}${days[i].checkin?.feel ? ` · day felt ${days[i].checkin.feel}` : ''}` })} /></g> : null)}
      </svg>
      {tip && <div class="tip" style={{ left: tip.x + '%', top: (tip.y / H * 100) + '%' }}>{tip.text}</div>}
    </div>
  );
}
