import { useState } from 'preact/hooks';
import { useQ } from '../ctx.jsx';
import { Icon } from '../icons.jsx';
import { Check, ItemMeta } from '../components.jsx';
import { fmtMin, addDays } from '../../core/dates.js';
import { BUCKETS, bucketOf, moveToBucket, addItems } from '../../core/actions.js';
import { offlineExtract, toItems } from '../../core/extract.js';
import { store } from '../../core/store.js';

/** Trello-style board: columns by when you'll do it. Drag cards between columns; tick anything. */
export function Tasks() {
  const q = useQ(), { state, p, today } = q;
  const [filter, setFilter] = useState('');
  const [showDone, setShowDone] = useState(false);
  const goals = Object.values(state.goals).filter(g => g && !g.del);
  const [goal, setGoal] = useState('');
  const nextOf = {};
  for (const s of p.sessions) if (!s.done && (!nextOf[s.itemId] || s.date < nextOf[s.itemId].date)) nextOf[s.itemId] = s;
  const cols = Object.fromEntries(BUCKETS.map(b => [b.id, []]));
  const all = Object.values(state.items).filter(i => i && !i.del && i.kind === 'task');
  const match = i => (!filter || i.title.toLowerCase().includes(filter.toLowerCase())) && (!goal || (i.goals || []).includes(goal));
  for (const it of all) {
    if (it.status === 'done' || !match(it)) continue;
    const s = nextOf[it.id];
    let b = s ? bucketOf(s.date, today) : it.due ? bucketOf(it.due, today) : it.start && it.start > addDays(today, 13) ? 'later' : 'anytime';
    cols[b].push({ it, s });
  }
  for (const k in cols) cols[k].sort((a, b) => ((a.s?.date || a.it.due || '9') + (a.it.due || '9')).localeCompare((b.s?.date || b.it.due || '9') + (b.it.due || '9')));
  const done = all.filter(i => i.status === 'done' && i.doneAt > Date.now() - 7 * 864e5 && match(i)).sort((a, b) => b.doneAt - a.doneAt);

  return (
    <div class="page wide">
      <div class="page-head">
        <h1>Tasks</h1>
        <span class="grow" />
        <div class="row" style="gap:6px">
          <Icon name="search" size={16} className="muted" />
          <input class="input" style="width:180px;height:32px" placeholder="Filter" value={filter} onInput={e => setFilter(e.currentTarget.value)} />
          {goals.length > 0 && <select class="select" style="width:auto;height:32px;padding:0 8px" value={goal} onChange={e => setGoal(e.currentTarget.value)}><option value="">All goals</option>{goals.map(g => <option value={g.id} key={g.id}>{g.name}</option>)}</select>}
          <button class={`btn ${showDone ? 'primary' : ''}`} onClick={() => setShowDone(v => !v)}>Done · {done.length}</button>
        </div>
      </div>
      <div class="board">
        {BUCKETS.map(b => <Column key={b.id} b={b} list={cols[b.id]} />)}
        {showDone && (
          <div class="bcol">
            <div class="bh"><b>Done</b><span class="muted">last 7 days</span></div>
            {done.map(it => <div class="bcard done" key={it.id} onClick={() => q.open('item', { id: it.id })}><Check on onToggle={e => q.checkItem(it, e)} /><div class="grow"><div class="t">{it.title}</div></div></div>)}
          </div>
        )}
      </div>
    </div>
  );
}

function Column({ b, list }) {
  const q = useQ(), { state, today } = q;
  const [adding, setAdding] = useState(false);
  const total = list.reduce((a, x) => a + (x.s ? x.s.minutes : x.it.effort), 0);
  const add = async v => {
    v = v.trim(); setAdding(false); if (!v) return;
    const ex = offlineExtract(v, Object.values(state.goals).filter(g => g && !g.del), today);
    const its = toItems(ex, []); if (!its.length) return;
    const r = await addItems(its);
    if (b.id !== 'anytime') for (const it of its) if (!it.due && it.kind === 'task') await moveToBucket(it.id, b.id, q.p);
    q.toast('Added.', { undo: r.undo });
  };
  return (
    <div class="bcol" data-drop={'bucket:' + b.id}>
      <div class="bh"><b>{b.title}</b><span class="muted">{list.length}{total ? ` · ${fmtMin(total)}` : ''}</span></div>
      {list.map(({ it, s }) => {
        const doneMin = Object.values(state.sessions).filter(x => x && !x.del && x.done && x.itemId === it.id).reduce((a, x) => a + x.minutes, 0);
        return (
          <div class="bcard" key={it.id} data-drag={'i:' + it.id} onClick={() => q.open('item', { id: it.id, sid: s?.id })}>
            <Check on={false} onToggle={e => q.checkItem(it, e)} label={`Mark “${it.title}” done`} />
            <div class="grow">
              <div class="t">{it.title}</div>
              <div class="mt"><ItemMeta it={it} s={s && s.of > 1 ? s : null} /></div>
              {it.effort >= 120 && doneMin > 0 && <div class="progress"><i style={{ width: Math.min(100, doneMin / it.effort * 100) + '%' }} /></div>}
            </div>
          </div>
        );
      })}
      {!list.length && <div class="muted small" style="padding:8px 4px">{b.id === 'anytime' ? 'Tasks without a date wait here.' : 'Nothing here.'}</div>}
      {adding ? <input class="qadd" autofocus placeholder="New task…" onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = ''; e.currentTarget.blur(); } }} onBlur={e => add(e.currentTarget.value)} />
        : <button class="btn ghost sm" style="justify-content:flex-start" onClick={() => setAdding(true)}><Icon name="plus" size={14} />Add</button>}
    </div>
  );
}
