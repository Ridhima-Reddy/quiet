import { useMemo, useState } from 'preact/hooks';
import { useQ } from '../ctx.jsx';
import { Icon } from '../icons.jsx';
import { SessionRow, EventRow, Check, ItemMeta, Battery, Empty, Mascot, goalColor } from '../components.jsx';
import { longDate, partOfDay, fmtMin, addDays, relDay, mondayOf, range, DOW, fmtTime } from '../../core/dates.js';
import { dayLoad } from '../../core/planner.js';
import { assistantCards, pickNext, canChunk, recentPattern } from '../../core/wellbeing.js';
import { checkin, toggleHabit, pinItemToDay, planLighten, applyLighten, recoveryDays } from '../../core/actions.js';
import { store } from '../../core/store.js';

const ENERGY = [[1, 'Low'], [2, 'Okay'], [3, 'Good'], [4, 'Great']];

export function Today() {
  const q = useQ(), { state, prefs, p, today, local } = q;
  const ld = dayLoad(p, today);
  const list = (p.byDay[today] || []).slice().sort((a, b) => (a.done - b.done) || ((state.items[b.itemId]?.due === today) - (state.items[a.itemId]?.due === today)));
  const open = list.filter(s => !s.done || q.recent[s.id]), done = list.filter(s => s.done && !q.recent[s.id]);
  const doneQuick = Object.values(state.items).filter(i => i && !i.del && i.status === 'done' && i.doneAt && new Date(i.doneAt).toDateString() === new Date().toDateString() && !list.some(s => s.itemId === i.id));
  const events = p.busy[today]?.events || [];
  const deadlinesToday = Object.values(state.items).filter(i => i && !i.del && i.kind === 'task' && i.hard && i.due === today && i.status !== 'done' && !list.some(s => s.itemId === i.id));
  const ci = state.checkins[today] && !state.checkins[today].del ? state.checkins[today] : null;
  const name = prefs.name ? `, ${prefs.name}` : '';
  const part = partOfDay();
  const greet = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Still up' }[part];
  const [skip, setSkip] = useState([]);
  const next = useMemo(() => pickNext(state, prefs, p, { energy: ci?.energy, skip }), [p, ci?.energy, skip]);
  const cards = assistantCards(state, prefs, p, { dismissed: local.dismissed || {} });
  const room = ld.ratio < 0.7 && part !== 'night' ? p.anytime.filter(i => (i.goals || []).length || i.effort <= 30).slice(0, 3) : [];
  const [showDone, setShowDone] = useState(false);

  const shape = [];
  if (events.length) shape.push(`${events.length} event${events.length > 1 ? 's' : ''}`);
  const left = open.filter(s => !s.done);
  if (left.length) shape.push(`${left.length} thing${left.length > 1 ? 's' : ''} to do (${fmtMin(left.reduce((a, s) => a + s.minutes, 0))})`);
  const doneN = done.length + doneQuick.length;
  const dayWord = { Light: 'A light day.', Balanced: 'A balanced day.', Full: 'A full day.', Over: 'More than fits today.', Rest: 'A rest day.', Busy: 'A busy day.' }[ld.label];

  const act = async id => {
    if (id === 'dismiss') return;
    if (id.startsWith('feel:')) { await checkin(today, { feel: id.slice(5) }); q.toast(id === 'feel:heavy' ? 'Noted. I\'ll go easier on you.' : 'Thanks for telling me.'); return; }
    if (id === 'lighten-today' || id === 'lighten-tomorrow') { q.open('lighten', { day: id === 'lighten-today' ? today : addDays(today, 1) }); return; }
    if (id === 'recovery') { await recoveryDays(addDays(today, 1), 3, 0.7, p); q.toast('The next 3 days are set lighter. Rest is part of the plan.'); }
  };
  const dismiss = id => store.setLocal(l => ({ dismissed: { ...(l.dismissed || {}), [id]: today } }));

  return (
    <div class="today-grid">
      <div>
        <div class="hello">
          <div class="date">{longDate(today)}</div>
          <div class="row" style="align-items:flex-end">
            <h1 class="grow">{greet}{name}.</h1>
            {prefs.companion !== 'none' && <div class="hello-pet"><Mascot type={prefs.companion} size={52} /></div>}
          </div>
          <div class="shape">{dayWord} {shape.join(' · ') || (doneN ? '' : 'Nothing planned yet.')}{doneN ? ` ${doneN} done so far.` : ''}</div>
          <DayMeter ld={ld} list={list} />
        </div>

        {!ci?.energy && part !== 'night' && (
          <div class="card energy">
            <div class="q">How's your energy right now?</div>
            <div class="opts">{ENERGY.map(([v, l]) => <button key={v} onClick={async () => { await checkin(today, { energy: v }); q.toast(v === 1 ? 'Thanks. I\'ve made today gentler.' : v === 4 ? 'Love that. Let\'s use it well.' : 'Got it.'); }}><Battery level={v} />{l}</button>)}</div>
          </div>
        )}

        {cards.slice(0, 2).map((c, i) => (
          <div class={`acard ${c.tone} ${i > 0 ? 'extra' : ''}`} key={c.id}>
            <div class="grow">
              <h4>{c.title}</h4><p>{c.body}</p>
              {c.actions.length > 0 && <div class="acts">{c.actions.map(a => <button key={a.id} class={`btn sm ${a.id === 'dismiss' ? 'ghost' : ''}`} onClick={async () => { await act(a.id); dismiss(c.id); }}>{a.label}</button>)}</div>}
            </div>
            <button class="btn ghost icon sm x" aria-label="Dismiss" onClick={() => dismiss(c.id)}><Icon name="x" size={15} /></button>
          </div>
        ))}

        {next && (
          <div class="start">
            <div class="eyebrow">Start here</div>
            <h3>{next.item.title}</h3>
            <div class="why">{fmtMin(next.session.minutes)}{next.session.of > 1 ? ` · part ${next.session.n} of ${next.session.of}` : ''} · {next.reason}</div>
            <div class="acts">
              <button class="btn primary" onClick={() => q.open('focus', { itemId: next.item.id, sid: next.session.id })}><Icon name="play" size={15} />Focus</button>
              {canChunk(next.item) && <button class="btn" onClick={() => q.open('item', { id: next.item.id, sid: next.session.id, steps: true })}><Icon name="steps" size={15} />{next.item.steps ? 'Show my steps' : 'Break it down'}</button>}
              <button class="btn" onClick={e => q.check(next.session, e)}><Icon name="check" size={15} />Done</button>
              {next.others.length > 0 && <button class="btn ghost" onClick={() => setSkip(s => [...s, next.session.id])}>Something else</button>}
            </div>
          </div>
        )}

        {(events.length > 0 || deadlinesToday.length > 0) && (
          <div class="section">
            <div class="section-h"><h2>Schedule</h2></div>
            <div class="list">
              {deadlinesToday.map(i => <div class="ev-row" key={i.id} onClick={() => q.open('item', { id: i.id })}><div class="time" style="color:var(--due)">Due</div><div class="bar" style="background:var(--due)" /><div class="grow">{i.title}</div></div>)}
              {events.map(e => <EventRow key={e.id + e.time} ev={e} date={today} />)}
            </div>
          </div>
        )}

        <div class="section">
          <div class="section-h"><h2>To do</h2>{left.length > 0 && <span class="muted">{fmtMin(left.reduce((a, s) => a + s.minutes, 0))} · drag to move</span>}</div>
          <div class="list" data-drop={'day:' + today}>
            {open.map(s => <SessionRow key={s.id} s={s} />)}
            {!open.length && (list.length || doneQuick.length
              ? <Empty title="All clear.">You finished everything planned for today. Rest counts too.</Empty>
              : <Empty title="Nothing on today.">Dump what's on your mind and I'll find it a place — or enjoy the space.</Empty>)}
          </div>
          {(done.length > 0 || doneQuick.length > 0) && (
            <>
              <button class="collapser" onClick={() => setShowDone(v => !v)}><Icon name={showDone ? 'down' : 'right'} size={14} />Done today · {doneN}</button>
              {showDone && <div class="list">{done.map(s => <SessionRow key={s.id} s={s} />)}{doneQuick.map(i => <div class="item done" key={i.id} onClick={() => q.open('item', { id: i.id })}><Check on onToggle={e => q.checkItem(i, e)} /><div class="grow"><div class="t">{i.title}</div></div></div>)}</div>}
            </>
          )}
        </div>

        {room.length > 0 && (
          <div class="section">
            <div class="section-h"><h2>If you have room</h2><span class="muted">no deadline — only if you feel like it</span></div>
            <div class="list">{room.map(i => (
              <div class="item" key={i.id} onClick={() => q.open('item', { id: i.id })}>
                <Check on={false} onToggle={e => q.checkItem(i, e)} />
                <div class="grow"><div class="t">{i.title}</div><ItemMeta it={i} /></div>
                <button class="btn sm ghost" data-nodrag onClick={async e => { e.stopPropagation(); await pinItemToDay(i.id, today); q.toast('Added to today.'); }}>Add to today</button>
              </div>))}</div>
          </div>
        )}

        <Habits />
        <Parked />
      </div>
      <Rail />
    </div>
  );
}

function DayMeter({ ld, list }) {
  const doneMin = list.filter(s => s.done).reduce((a, s) => a + s.minutes, 0), leftMin = list.filter(s => !s.done).reduce((a, s) => a + s.minutes, 0);
  const total = Math.max(ld.cap, doneMin + leftMin, 1);
  return (
    <div class={`meter ${ld.label === 'Over' ? 'over' : ''}`} title={`${fmtMin(doneMin)} done · ${fmtMin(leftMin)} left · room for about ${fmtMin(ld.cap)} of focused work today`}>
      <i class="m-done" style={{ width: (doneMin / total * 100) + '%' }} /><i class="m-left" style={{ width: (leftMin / total * 100) + '%' }} />
    </div>
  );
}

export function Habits({ compact = false }) {
  const q = useQ(), { state, today } = q;
  const habits = Object.values(state.habits).filter(h => h && !h.del).sort((a, b) => (a.order || 0) - (b.order || 0));
  if (!habits.length) return compact ? null : (
    <div class="section"><div class="section-h"><h2>Habits</h2></div>
      <div class="muted small">Track a few gentle habits — gym, reading, sleep. <a href="#/you" onClick={() => setTimeout(() => document.getElementById('habits')?.scrollIntoView(), 50)}>Add one</a></div></div>
  );
  const wk = mondayOf(today), days = range(wk, addDays(wk, 6));
  return (
    <div class="section">
      <div class="section-h"><h2>Habits</h2><span class="muted">this week</span></div>
      <div class="habits">{habits.map(h => {
        const on = !!(state.habitLogs[`${h.id}@${today}`] && !state.habitLogs[`${h.id}@${today}`].del);
        const n = days.filter(d => state.habitLogs[`${h.id}@${d}`] && !state.habitLogs[`${h.id}@${d}`].del).length;
        return (
          <button key={h.id} class={`habit ${on ? 'on' : ''}`} onClick={async e => { const r = e.currentTarget.getBoundingClientRect(); const now = await toggleHabit(h.id, today); if (now) { q.celebrate({ x: r.left + 16, y: r.top + 18 }); if (n + 1 === h.perWeek) q.toast(`${h.name}: weekly goal reached.`); } }}>
            <span class="hc">{on && <Icon name="check" size={13} />}</span>{h.name}<span class="wk">{n}/{h.perWeek}</span>
          </button>
        );
      })}</div>
    </div>
  );
}

function Parked() {
  const q = useQ(), parked = Object.values(q.state.parked).filter(x => x && !x.del).sort((a, b) => b.at - a.at);
  const [openP, setOpen] = useState(false);
  if (!parked.length) return null;
  return (
    <div class="section">
      <button class="collapser" onClick={() => setOpen(v => !v)}><Icon name={openP ? 'down' : 'right'} size={14} />Parked thoughts · {parked.length}</button>
      {openP && <div><div class="muted small" style="margin-bottom:6px">Worries you wrote down. They're out of your head now — you can let them rest here.</div>
        {parked.map(x => <div class="parked" key={x.id}><Icon name="cloud" size={15} className="muted" /><span class="grow">{x.text}</span><button class="btn ghost icon sm" aria-label="Let it go" title="Let it go" onClick={() => store.remove('parked', x.id)}><Icon name="x" size={14} /></button></div>)}</div>}
    </div>
  );
}

function Rail() {
  const q = useQ(), { state, p, today, prefs } = q;
  const end = addDays(today, 14);
  const upcoming = [];
  for (const it of Object.values(state.items)) {
    if (!it || it.del || it.status === 'done') continue;
    if (it.kind === 'event' && it.date > today && it.date <= end) upcoming.push({ d: it.date, t: it.time, title: it.title, kind: 'event', id: it.id });
    if (it.kind === 'task' && it.due && it.due > today && it.due <= end && (it.hard || it.effort >= 120)) upcoming.push({ d: it.due, title: 'Due: ' + it.title, kind: 'due', id: it.id });
  }
  for (const e of state.gcal?.events || []) if (!e.quietId && e.date > today && e.date <= addDays(today, 3) && !e.allDay) upcoming.push({ d: e.date, t: e.time, title: e.title, kind: 'gcal', link: e.link });
  upcoming.sort((a, b) => (a.d + (a.t || '')).localeCompare(b.d + (b.t || '')));
  const wk = range(today, addDays(today, 6));
  const max = Math.max(60, ...wk.map(d => dayLoad(p, d).planned + (p.busy[d]?.min || 0) * 0.5));
  const pat = recentPattern(state, prefs, p, today);
  return (
    <aside class="rail">
      <div class="card">
        <h3>Next 7 days</h3>
        <div class="mini-week">{wk.map(d => { const l = dayLoad(p, d), h = Math.max(4, ((l.planned + (p.busy[d]?.min || 0) * 0.5) / max) * 48); return <div key={d} data-drop={'day:' + d} class={`b ${d === today ? 'today' : ''} ${l.label === 'Over' ? 'over' : ''}`} title={`${relDay(d, today)}: ${l.label} · ${fmtMin(l.planned)} planned`} onClick={() => { location.hash = '#/plan?d=' + d; }}><i style={{ height: h + 'px' }} />{DOW[new Date(d + 'T12:00').getDay()][0]}</div>; })}</div>
      </div>
      <div class="card">
        <h3>Coming up</h3>
        {upcoming.length ? upcoming.slice(0, 8).map((u, i) => <div class="up-row" key={i} onClick={() => u.id ? q.open('item', { id: u.id }) : u.link && open(u.link, '_blank')}><span class="when">{relDay(u.d, today)}{u.t ? ' ' + fmtTime(u.t) : ''}</span><span class="grow" style={{ color: u.kind === 'due' ? 'var(--due)' : u.kind === 'gcal' ? 'var(--ink-2)' : 'var(--ink)' }}>{u.title}</span></div>) : <div class="muted small">Nothing big in the next two weeks.</div>}
      </div>
      <div class="card">
        <h3>This week so far</h3>
        <div class="small">{pat.done7} things done · {fmtMin(pat.focus7)} of work{pat.heavy7 ? ` · ${pat.heavy7} heavy day${pat.heavy7 > 1 ? 's' : ''}` : ''}</div>
        <a class="small" href="#/week">See your week →</a>
      </div>
    </aside>
  );
}
