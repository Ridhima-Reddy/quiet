// Evaluation page for the 10-student study: extraction precision/recall, goal-tag accuracy,
// scheduling sensibility, time to organise, and a short questionnaire. Export to CSV.
import { useQ } from '../ctx.jsx';
import { store } from '../../core/store.js';

const Q = ['Quiet was easy to use', 'It reduced how much I had to keep in my head', 'My workload feels clearer', 'The plan it made was realistic', 'The nudges felt helpful, not intrusive', 'It felt like support, not another task', 'I would keep using it'];
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '–';

export function Study() {
  const { state, prefs } = useQ();
  const runs = Object.values(state.runs).filter(r => r && !r.del && !r.lk).sort((a, b) => a.ts - b.ts);
  const lkRec = state.runs['likert-' + (prefs.participant || 'P')] || { id: 'likert-' + (prefs.participant || 'P'), lk: true, a: [] };
  const upd = (r, f) => store.put('runs', { ...r, ...f });
  let tp = 0, n = 0, miss = 0, g = 0, w = 0, wn = 0, so = 0, sn = 0, secs = 0;
  runs.forEach(r => { r.tasks.forEach(t => { n++; if (t.ok) tp++; if (t.goalOk) g++; if (t.whenOk != null) { wn++; if (t.whenOk) w++; } }); miss += +r.missed || 0; if (r.startOk != null) { sn++; if (r.startOk) so++; } secs += r.secs || 0; });
  const summary = [['Extraction precision', pct(tp, n)], ['Extraction recall', pct(tp, tp + miss)], ['Goal tags right', pct(g, n)], ['Scheduled sensibly', pct(w, wn)], ['"Start here" sensible', pct(so, sn)], ['Avg. time to organise', runs.length ? (secs / runs.length).toFixed(1) + ' s' : '–']];
  const exportCSV = () => {
    const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = [['participant', 'run', 'model', 'offline', 'seconds', 'items', 'correct', 'missed', 'goal_ok', 'when_ok', 'start_ok', ...Q.map((_, i) => 'Q' + (i + 1))]];
    runs.forEach((r, i) => rows.push([r.participant || prefs.participant, i + 1, r.model, r.offline, r.secs, r.tasks.length, r.tasks.filter(t => t.ok).length, r.missed ?? '', r.tasks.filter(t => t.goalOk).length, r.tasks.filter(t => t.whenOk).length, r.startOk ?? '', ...Q.map((_, j) => lkRec.a[j] ?? '')]));
    rows.push([], ['SUMMARY', ...summary.flat()]);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv' })); a.download = `quiet_eval_${prefs.participant || 'participant'}.csv`; a.click();
  };
  return (
    <div class="page">
      <div class="page-head"><h1>Evaluation</h1><span class="grow" /><span class="muted">Participant {prefs.participant || '—'}</span><button class="btn primary" onClick={exportCSV}>Export CSV</button></div>
      <div class="stats">{summary.map(([k, v]) => <div class="stat" key={k}><b>{v}</b><span>{k}</span></div>)}</div>
      {!runs.length && <div class="card pad section muted">No brain dumps logged yet. Turn on Study mode in You, then use the brain dump.</div>}
      {runs.map((r, i) => (
        <div class="card pad section" key={r.id}>
          <div class="row"><b>Run {i + 1}</b><span class="muted small">{new Date(r.ts).toLocaleString()} · {r.secs}s · {r.model}{r.offline ? ' (offline sorter)' : ''}</span></div>
          <table class="eval" style="margin-top:8px"><thead><tr><th>Item Quiet extracted</th><th>Real & correct?</th><th>Goal tag right?</th><th>Placed sensibly?</th></tr></thead>
            <tbody>{r.tasks.map((t, j) => <tr key={j}><td>{t.title}<span class="muted small">{t.kind === 'event' ? ' · event' : ''}{t.goals?.length ? ' · ' + t.goals.map(id => state.goals[id]?.name).filter(Boolean).join(', ') : ''}</span></td>
              {['ok', 'goalOk', 'whenOk'].map(k => <td key={k}><input type="checkbox" checked={!!t[k]} onChange={e => { const tasks = r.tasks.slice(); tasks[j] = { ...t, [k]: e.currentTarget.checked }; upd(r, { tasks }); }} /></td>)}</tr>)}</tbody></table>
          <div class="row small" style="margin-top:8px">Things it missed: <input type="number" min="0" class="input" style="width:70px" value={r.missed ?? ''} onChange={e => upd(r, { missed: +e.currentTarget.value })} />
            <label class="row" style="margin-left:14px"><input type="checkbox" checked={!!r.startOk} onChange={e => upd(r, { startOk: e.currentTarget.checked })} />"Start here" made sense</label></div>
        </div>
      ))}
      <div class="card pad section">
        <div class="section-h"><h2>Questionnaire</h2><span class="muted">1 = strongly disagree · 5 = strongly agree</span></div>
        {Q.map((qq, i) => <div class="set-row" key={i}><span class="grow">{qq}</span><div class="seg">{[1, 2, 3, 4, 5].map(v => <button key={v} class={lkRec.a[i] === v ? 'on' : ''} onClick={() => { const a = lkRec.a.slice(); a[i] = v; store.put('runs', { ...lkRec, a }); }}>{v}</button>)}</div></div>)}
      </div>
    </div>
  );
}
