import { useEffect, useRef, useState } from 'preact/hooks';
import { useQ } from '../ctx.jsx';
import { Icon } from '../icons.jsx';
import { Sheet, Mascot } from '../components.jsx';
import { extract, toItems } from '../../core/extract.js';
import { addItems, park } from '../../core/actions.js';
import { plan, dayLoad } from '../../core/planner.js';
import { calReason, uid } from '../../core/model.js';
import { store } from '../../core/store.js';
import { relDay, fmtMin, fmtTime, shortDate } from '../../core/dates.js';
import { readFile } from '../../core/files.js';
import { startVoice, voiceAvailable } from '../voice.js';
import { aiReady } from '../../core/llm.js';

const EXAMPLES = [
  'DSA midsem next Friday 10am, problem set 4 due Monday, reply to Prof. Rao, call home tomorrow evening…',
  'SOP for ETH due 15 Dec, group meeting Thursday 5pm, laundry, I\'m worried I\'m behind on research…',
  'Read the Transformer paper, gym 3 times a week, pay hostel fees by the 20th, conference 3–5 Dec…',
];

export function Dump({ initial = '' }) {
  const q = useQ(), { state, prefs, p, today } = q;
  const [text, setText] = useState(initial || store.local.ui?.dumpDraft || '');
  const [files, setFiles] = useState([]);
  const [phase, setPhase] = useState('write'); // write | think | done
  const [res, setRes] = useState(null);
  const [rec, setRec] = useState(null);
  const ta = useRef();
  const ph = useRef(EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]);
  useEffect(() => { const t = setTimeout(() => store.setLocal(l => ({ ui: { ...(l.ui || {}), dumpDraft: text } })), 400); return () => clearTimeout(t); }, [text]);

  const go = async () => {
    const dump = text.trim(); if (!dump && !files.length) return;
    setPhase('think');
    const goals = Object.values(state.goals).filter(g => g && !g.del);
    const existing = Object.values(state.items).filter(i => i && !i.del && i.status !== 'done');
    const before = (p.byDay[today] || []).length;
    const ex = await extract(dump || 'See the attached file.', { goals, existing: existing.map(i => i.title), attachments: files.filter(f => !f.error) });
    const items = toItems(ex, existing);
    const attachText = files.filter(f => f.text).map(f => f.text).join('\n\n').slice(0, 30000);
    if (attachText && items.length === 1) items[0].attach = [{ name: files[0].name, text: attachText }];
    const added = items.length ? await addItems(items) : { items: [], undo: async () => {} };
    for (const c of ex.concerns || []) await park(c);
    // Where did everything land?
    const p2 = plan(store.state, store.prefs(), { energy: q.energy });
    const landed = added.items.map(it => {
      const ss = p2.sessions.filter(s => s.itemId === it.id);
      let where;
      if (it.kind === 'event') where = it.date ? `${relDay(it.date, today)}${it.time ? ' ' + fmtTime(it.time) : ''}` : 'No date yet';
      else if (!ss.length) where = it.due ? `Due ${relDay(it.due, today)}` : 'Anytime';
      else if (ss.length === 1) where = relDay(ss[0].date, today);
      else where = `${ss.length} sessions, ${shortDate(ss[0].date)}–${shortDate(ss[ss.length - 1].date)}`;
      return { it, where, cal: calReason(it), tight: ss.some(s => s.risk) };
    });
    const newToday = (p2.byDay[today] || []).filter(s => added.items.some(i => i.id === s.itemId)).length;
    const todayFull = dayLoad(p, today).ratio >= 0.85;
    if (prefs.studyMode) await store.put('runs', { id: uid('r'), ts: Date.now(), chars: dump.length, secs: ex.secs, model: ex.offline ? 'offline' : (prefs.aiModel || prefs.aiProvider), offline: ex.offline, tasks: added.items.map(i => ({ id: i.id, title: i.title, kind: i.kind, goals: i.goals, ok: null, goalOk: null, whenOk: null })), missed: null, startOk: null, participant: prefs.participant });
    setRes({ landed, concerns: ex.concerns || [], habits: ex.habits || [], offline: ex.offline, error: ex.error, undo: added.undo, newToday, todayFull, before });
    setText(''); setFiles([]); store.setLocal(l => ({ ui: { ...(l.ui || {}), dumpDraft: '' } }));
    setPhase('done');
    q.celebrate({ big: false });
  };

  const onFiles = async list => {
    for (const f of list) {
      const id = Math.random().toString(36).slice(2);
      setFiles(fs => [...fs, { id, name: f.name, loading: true }]);
      try { const r = await readFile(f); setFiles(fs => fs.map(x => x.id === id ? { id, ...r } : x)); }
      catch (e) { setFiles(fs => fs.map(x => x.id === id ? { id, name: f.name, error: e.message } : x)); q.toast(e.message); }
    }
  };
  const mic = async () => {
    if (rec) { rec.stop(); setRec(null); return; }
    try {
      const base = text ? text.replace(/\s*$/, ' ') : '';
      const r = await startVoice({ onText: t => setText(base + t), onEnd: () => setRec(null), onError: m => { q.toast(m); setRec(null); } });
      setRec(r);
    } catch (e) { q.toast(e.message); }
  };

  if (phase === 'think') return (
    <Sheet kind="modal" title="Sorting" onClose={q.close}>
      <div class="thinking"><Mascot type={prefs.companion === 'none' ? 'moss' : prefs.companion} size={72} className="cheer" /><div class="serif" style="font-size:18px">Sorting it out gently…</div><div class="small muted">{aiReady() ? 'Reading dates, effort and what matters' : 'Using the built-in sorter'}</div></div>
    </Sheet>
  );

  if (phase === 'done' && res) {
    const onCal = res.landed.filter(x => x.cal), onList = res.landed.filter(x => !x.cal);
    const gconnected = store.local.google?.connected && prefs.gcalPush;
    return (
      <Sheet kind="modal" title="Here's your plan" onClose={q.close} footer={<>
        {res.landed.length > 0 && <button class="btn ghost" onClick={async () => { await res.undo(); q.close(); q.toast('Undone.'); }}>Undo all</button>}
        <span class="grow" /><button class="btn" onClick={() => { setRes(null); setPhase('write'); }}>Add more</button><button class="btn primary" onClick={() => { q.close(); location.hash = '#/today'; }}>Looks good</button></>}>
        <p class="serif" style="font-size:17px;margin:0 0 6px">{res.landed.length ? `${res.landed.length} thing${res.landed.length > 1 ? 's' : ''} sorted.` : 'Nothing new to add.'}{res.concerns.length ? ` ${res.concerns.length} worr${res.concerns.length > 1 ? 'ies' : 'y'} parked.` : ''}</p>
        <p class="small muted" style="margin:0 0 16px">{res.newToday ? `${res.newToday} of them landed on today because ${res.newToday > 1 ? 'they\'re' : 'it\'s'} urgent or today had room.` : res.todayFull ? 'Today is already full, so nothing new landed there — everything went to the days before it\'s due.' : 'Nothing new on today — each thing sits a little before it\'s due.'} Big tasks are spread across days.{res.offline ? (res.error ? ` (AI unavailable: ${res.error} — used the built-in sorter.)` : ' Sorted offline — add an AI key in You for smarter sorting.') : ''}</p>
        {onCal.length > 0 && <div class="res-group"><div class="label" style="margin-bottom:4px">On your calendar{gconnected ? ' · sent to Google' : ''}</div>
          {onCal.map(x => <div class="res-row" key={x.it.id} onClick={() => q.open('item', { id: x.it.id })} style="cursor:pointer"><Icon name={x.it.kind === 'event' ? 'calendar' : 'flag'} size={16} className="muted" /><span>{x.cal === 'deadline' ? 'Due: ' : ''}{x.it.title}</span><span class="where">{x.where}</span></div>)}</div>}
        {onList.length > 0 && <div class="res-group"><div class="label" style="margin-bottom:4px">On your list</div>
          {onList.map(x => <div class="res-row" key={x.it.id} onClick={() => q.open('item', { id: x.it.id })} style="cursor:pointer"><Icon name="check" size={16} className="muted" /><span>{x.it.title}</span><span class="where">{x.tight ? <span class="chip warn" style="margin-right:6px">tight</span> : null}{x.where}{x.it.kind === 'task' ? ` · ${fmtMin(x.it.effort)}` : ''}</span></div>)}</div>}
        {res.habits.length > 0 && <div class="res-group"><div class="label" style="margin-bottom:4px">Sounds like a habit</div>
          {res.habits.map((h, i) => <div class="res-row" key={i}><Icon name="leaf" size={16} className="muted" /><span>{h.name} · {h.perWeek === 7 ? 'daily' : `${h.perWeek}× a week`}</span><span class="where"><button class="btn sm" onClick={async e => { e.currentTarget.disabled = true; await store.put('habits', { id: uid('h'), name: h.name, perWeek: h.perWeek, order: Date.now() }); q.toast('Habit added.'); }}>Track it</button></span></div>)}</div>}
        {res.concerns.length > 0 && <div class="res-group"><div class="label" style="margin-bottom:4px">Parked for now</div>
          {res.concerns.map((c, i) => <div class="res-row" key={i}><Icon name="cloud" size={16} className="muted" /><span class="muted">{c}</span></div>)}
          <div class="small muted" style="margin-top:6px">These aren't tasks. They're written down now, so your head doesn't have to hold them.</div></div>}
      </Sheet>
    );
  }

  return (
    <Sheet kind="modal" title="What's on your mind?" onClose={q.close} footer={<>
      <div class="dump-tools">
        {voiceAvailable() && <button class={`btn icon ${rec ? 'mic-on' : ''}`} onClick={mic} aria-label={rec ? 'Stop dictation' : 'Speak instead of typing'} title="Speak instead of typing"><Icon name="mic" /></button>}
        <label class="btn icon" title="Attach an assignment sheet, syllabus or photo"><Icon name="clip" /><input type="file" class="sr" multiple accept=".pdf,.docx,.txt,.md,image/*" onChange={e => { onFiles([...e.currentTarget.files]); e.currentTarget.value = ''; }} /></label>
        {files.map(f => <span class="attach" key={f.id} title={f.error || ''}>{f.loading ? <Icon name="refresh" size={12} className="spin" /> : <Icon name={f.error ? 'x' : 'clip'} size={12} />}{f.name.length > 18 ? f.name.slice(0, 16) + '…' : f.name}{f.truncated ? ' (long — first part used)' : ''}<button class="btn ghost icon sm" style="width:18px;height:18px" onClick={() => setFiles(fs => fs.filter(x => x.id !== f.id))} aria-label="Remove"><Icon name="x" size={11} /></button></span>)}
      </div>
      <span class="grow" />
      <span class="kbd" title="Ctrl/⌘ + Enter">⌘↵</span>
      <button class="btn primary" disabled={!text.trim() && !files.some(f => !f.error && !f.loading)} onClick={go}><Icon name="sparkle" size={15} />Sort it out</button></>}>
      <textarea ref={ta} class="dump-area" autofocus value={text} placeholder={`Type everything — in any order, as messy as you like.\n\ne.g. ${ph.current}`} onInput={e => setText(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) go(); }}
        onPaste={e => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); onFiles(fs); } }} onDrop={e => { const fs = [...(e.dataTransfer?.files || [])]; if (fs.length) { e.preventDefault(); onFiles(fs); } }} />
      <div class="small muted">Deadlines, exams, meetings, chores, worries — I'll sort what goes on your calendar, what goes on your list, and what you can just let rest.</div>
    </Sheet>
  );
}
