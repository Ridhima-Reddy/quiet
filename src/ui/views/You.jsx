import { useEffect, useState } from 'preact/hooks';
import { useQ } from '../ctx.jsx';
import { Icon } from '../icons.jsx';
import { Switch, Seg, Mascot, goalColor } from '../components.jsx';
import { store } from '../../core/store.js';
import { uid, COMPANIONS, DEFAULT_PREFS } from '../../core/model.js';
import { PROVIDERS, testAI } from '../../core/llm.js';
import { getToken, disconnect, googleConfigured, clientId } from '../../google/auth.js';
import { syncNow } from '../../google/sync.js';
import { isExt, isDesktop, isStandalone, platformName } from '../../core/platform.js';
import { DOW } from '../../core/dates.js';
import { WEB_APP_URL } from '../../config.js';

const GOAL_IDEAS = ['Become a better researcher', 'Stay physically healthy', 'Keep in touch with family & friends', 'Land a great internship', 'Make time to create', 'Sleep well', 'Learn something new'];
const HABIT_IDEAS = [['Gym', 3], ['Read', 5], ['Sleep by 12', 5], ['Walk', 5], ['Meditate', 4], ['Call home', 2]];
const MIN_OPTS = [[0, 'Off'], [30, '30m'], [45, '45m'], [60, '1h'], [90, '1.5h'], [120, '2h']];

export function You() {
  const q = useQ(), { state, prefs, local } = q;
  const set = (k, v) => store.setPref(k, v);
  const setN = (k, v) => store.setPref('nudges', { ...prefs.nudges, [k]: v });
  const goals = Object.values(state.goals).filter(g => g && !g.del).sort((a, b) => (a.order || 0) - (b.order || 0));
  const habits = Object.values(state.habits).filter(h => h && !h.del).sort((a, b) => (a.order || 0) - (b.order || 0));
  const [g, setG] = useState(''), [h, setH] = useState('');
  const addGoal = name => { name = name.trim(); if (!name || goals.some(x => x.name.toLowerCase() === name.toLowerCase())) return; if (goals.length >= 8) return q.toast('Eight goals is plenty — maybe merge two?'); store.put('goals', { id: uid('g'), name, order: Date.now() }); setG(''); };
  const addHabit = (name, perWeek = 3) => { name = name.trim(); if (!name) return; store.put('habits', { id: uid('h'), name, perWeek, order: Date.now() }); setH(''); };

  return (
    <div class="page">
      <div class="page-head"><h1>You</h1><span class="grow" /><span class="muted small">{platformName}</span></div>

      <section class="set-sec">
        <h2>Hello{prefs.name ? `, ${prefs.name}` : ''}</h2><p>Quiet keeps your head clear, so you can spend your energy on what matters.</p>
        <div class="set-row"><div class="grow"><div>Your name</div><div>Used in greetings.</div></div><input class="input" style="max-width:200px" value={prefs.name} onChange={e => set('name', e.currentTarget.value.trim())} placeholder="First name" /></div>
        <div class="set-row" style="align-items:flex-start"><div class="grow"><div>Companion</div><div>A small friend who cheers you on and brings your nudges.</div></div></div>
        <div class="pets">{COMPANIONS.map(c => <button key={c.id} class={prefs.companion === c.id ? 'on' : ''} onClick={() => set('companion', c.id)}>{c.id === 'none' ? <div style="height:48px;display:grid;place-items:center"><Icon name="x" /></div> : <Mascot type={c.id} size={48} />}{c.name}</button>)}</div>
        <div class="set-row"><div class="grow"><div>Theme</div></div><Seg value={prefs.theme} options={[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]} onChange={v => set('theme', v)} /></div>
        <div class="set-row"><div class="grow"><div>Confetti when you finish things</div></div><Switch on={prefs.confetti} onChange={v => set('confetti', v)} label="Confetti" /></div>
        <div class="set-row"><div class="grow"><div>Soft sounds</div></div><Switch on={prefs.sound} onChange={v => set('sound', v)} label="Sounds" /></div>
      </section>

      <section class="set-sec">
        <h2>What matters to you</h2><p>Quiet tags tasks with these, favours them when you have room, and shows where your week actually went.</p>
        <div class="row wrap" style="margin-bottom:10px">{goals.map(x => <span class="goal-chip" key={x.id}><i class="dot" style={{ background: goalColor(state, x.id) }} />{x.name}<button aria-label={'Remove ' + x.name} onClick={() => store.remove('goals', x.id)}><Icon name="x" size={14} /></button></span>)}</div>
        <div class="row"><input class="input" value={g} onInput={e => setG(e.currentTarget.value)} onKeyDown={e => e.key === 'Enter' && addGoal(g)} placeholder="e.g. become a better researcher" /><button class="btn" onClick={() => addGoal(g)}>Add</button></div>
        <div class="row wrap" style="margin-top:8px">{GOAL_IDEAS.filter(x => !goals.some(y => y.name === x)).slice(0, 5).map(x => <button key={x} class="btn sm ghost" onClick={() => addGoal(x)}><Icon name="plus" size={13} />{x}</button>)}</div>
      </section>

      <section class="set-sec" id="habits">
        <h2>Habits</h2><p>Gentle, weekly targets. Missing a day doesn't break anything.</p>
        {habits.map(x => (
          <div class="set-row" key={x.id}><div class="grow"><div>{x.name}</div></div>
            <select class="select" style="width:auto" value={x.perWeek} onChange={e => store.put('habits', { ...x, perWeek: +e.currentTarget.value })}>{[1, 2, 3, 4, 5, 6, 7].map(n => <option key={n} value={n}>{n === 7 ? 'every day' : `${n}× a week`}</option>)}</select>
            <button class="btn ghost icon sm" aria-label="Remove habit" onClick={() => store.remove('habits', x.id)}><Icon name="trash" size={15} /></button></div>
        ))}
        <div class="row" style="margin-top:10px"><input class="input" value={h} onInput={e => setH(e.currentTarget.value)} onKeyDown={e => e.key === 'Enter' && addHabit(h)} placeholder="New habit" /><button class="btn" onClick={() => addHabit(h)}>Add</button></div>
        <div class="row wrap" style="margin-top:8px">{HABIT_IDEAS.filter(([n]) => !habits.some(y => y.name === n)).map(([n, k]) => <button key={n} class="btn sm ghost" onClick={() => addHabit(n, k)}><Icon name="plus" size={13} />{n}</button>)}</div>
      </section>

      <section class="set-sec">
        <h2>Your rhythm</h2><p>Quiet never plans more than this. Meetings and classes are subtracted automatically.</p>
        <div class="set-row"><div class="grow"><div>Focused work per day</div><div>Most people manage 3–5 hours of real focus.</div></div><select class="select" style="width:auto" value={prefs.focusHours} onChange={e => set('focusHours', +e.currentTarget.value)}>{[1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n} h</option>)}</select></div>
        <div class="set-row"><div class="grow"><div>My day runs</div></div><input type="time" class="input" style="width:auto" value={prefs.dayStart} onChange={e => set('dayStart', e.currentTarget.value)} /><span class="muted">to</span><input type="time" class="input" style="width:auto" value={prefs.dayEnd} onChange={e => set('dayEnd', e.currentTarget.value)} /></div>
        <div class="set-row"><div class="grow"><div>Bedtime</div><div>For the wind-down nudge.</div></div><input type="time" class="input" style="width:auto" value={prefs.bedtime} onChange={e => set('bedtime', e.currentTarget.value)} /></div>
        <div class="set-row"><div class="grow"><div>Rest days</div><div>Nothing gets scheduled on these.</div></div>
          <div class="seg">{[1, 2, 3, 4, 5, 6, 0].map(d => <button key={d} class={prefs.restDays.includes(d) ? 'on' : ''} onClick={() => set('restDays', prefs.restDays.includes(d) ? prefs.restDays.filter(x => x !== d) : [...prefs.restDays, d])}>{DOW[d]}</button>)}</div></div>
      </section>

      <section class="set-sec">
        <h2>Nudges</h2><p>Small reminders from your companion. Paused during Focus, meetings and quiet hours.</p>
        <div class="set-row"><div class="grow"><div>Show nudges on this device</div><div>{isExt ? 'Appears on the page you are browsing.' : isDesktop ? 'Appears next to your desktop companion.' : 'Shows while Quiet is open. For phone reminders, use Google Calendar sync below.'}</div></div><Switch on={local.nudgesHere !== false} onChange={v => store.setLocal({ nudgesHere: v })} label="Nudges on this device" /></div>
        {[['water', 'Water'], ['move', 'Move & stretch'], ['eyes', 'Rest your eyes']].map(([k, l]) => <div class="set-row" key={k}><div class="grow"><div>{l}</div></div><select class="select" style="width:auto" value={prefs.nudges[k]} onChange={e => setN(k, +e.currentTarget.value)}>{MIN_OPTS.map(([v, t]) => <option key={v} value={v}>{v ? 'every ' + t : t}</option>)}</select></div>)}
        <div class="set-row"><div class="grow"><div>Meals</div></div><Switch on={prefs.nudges.meals} onChange={v => setN('meals', v)} label="Meal nudges" />{prefs.nudges.meals && <><input type="time" class="input" style="width:auto" value={prefs.nudges.lunch} onChange={e => setN('lunch', e.currentTarget.value)} /><input type="time" class="input" style="width:auto" value={prefs.nudges.dinner} onChange={e => setN('dinner', e.currentTarget.value)} /></>}</div>
        <div class="set-row"><div class="grow"><div>Wind down before bed</div></div><Switch on={prefs.nudges.winddown} onChange={v => setN('winddown', v)} label="Wind-down nudge" /></div>
        <div class="set-row"><div class="grow"><div>Quiet hours</div></div><input type="time" class="input" style="width:auto" value={prefs.nudges.quietStart} onChange={e => setN('quietStart', e.currentTarget.value)} /><span class="muted">to</span><input type="time" class="input" style="width:auto" value={prefs.nudges.quietEnd} onChange={e => setN('quietEnd', e.currentTarget.value)} /></div>
        <div class="set-row"><div class="grow"><div>Stay quiet during meetings</div></div><Switch on={prefs.nudges.pauseInMeetings} onChange={v => setN('pauseInMeetings', v)} label="Pause in meetings" /></div>
        {isExt && <div class="set-row"><div class="grow"><div>Preview a nudge</div></div><button class="btn sm" onClick={() => chrome.runtime.sendMessage({ type: 'preview-nudge' })}>Show me</button></div>}
      </section>

      <GoogleSection />
      <AISection />
      <InstallSection />

      <section class="set-sec">
        <h2>Your data</h2><p>Everything lives on your devices and, if you connect Google, in a private app folder in your own Drive. Nobody else can read it.</p>
        <div class="row wrap">
          <button class="btn" onClick={() => { const data =JSON.parse(JSON.stringify(store.state)); delete data.prefs.aiKey; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })); a.download = `quiet-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); }}><Icon name="down" size={15} />Export backup</button>
          <label class="btn"><Icon name="up" size={15} />Import backup<input type="file" accept="application/json" class="sr" onChange={async e => { const f = e.currentTarget.files[0]; if (!f) return; try { const { mergeStates } = await import('../../core/merge.js'); const d = JSON.parse(await f.text()); await store.replace(mergeStates(store.state, d), { dirty: true }); q.toast('Backup merged in.'); } catch (err) { q.toast('That file could not be read.'); } }} /></label>
          <button class="btn danger" onClick={async () => { if (confirm('Erase everything on this device? (Your Google Drive copy is kept unless you disconnect first.)')) { await store.replace({}, { dirty: false }); await store.setLocal({ onboarded: false }); location.reload(); } }}>Erase this device</button>
        </div>
      </section>

      <section class="set-sec">
        <h2>Study mode</h2><p>For the user study: logs each brain dump so you can mark what Quiet got right.</p>
        <div class="set-row"><div class="grow"><div>Log brain dumps for evaluation</div></div><Switch on={prefs.studyMode} onChange={v => set('studyMode', v)} label="Study mode" /></div>
        {prefs.studyMode && <div class="set-row"><div class="grow"><div>Participant</div></div><input class="input" style="max-width:140px" value={prefs.participant} onChange={e => set('participant', e.currentTarget.value)} placeholder="P01" /><a class="btn sm" href="#/study">Open evaluation</a></div>}
      </section>
    </div>
  );
}

function GoogleSection() {
  const q = useQ(), { prefs, local, state } = q;
  const gl = local.google;
  const [busy, setBusy] = useState(false);
  const [cid, setCid] = useState(local.googleClientId || '');
  const set = (k, v) => store.setPref(k, v);
  const connect = async () => {
    setBusy(true);
    try { const t = await getToken({ interactive: true }); if (t) { q.toast('Connected. Syncing…'); await syncNow(); q.toast('All synced.'); } }
    catch (e) { q.toast(e.message); } finally { setBusy(false); }
  };
  const cals = state.gcal?.calendars || [];
  return (
    <section class="set-sec">
      <h2>Google account</h2>
      <p>One Google account keeps your laptop, phone and browser in sync, and puts the things you must not miss on your Google Calendar — so your phone reminds you.</p>
      {gl?.connected ? (
        <div class="set-row">
          {gl.picture ? <img src={gl.picture} width="34" height="34" style="border-radius:50%" alt="" referrerpolicy="no-referrer" /> : <Icon name="google" size={22} />}
          <div class="grow"><div>{gl.email || 'Connected'}</div><div>{local.syncError ? local.syncError : local.lastSync ? `Last synced ${new Date(local.lastSync).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Not synced yet'}</div></div>
          <button class="btn sm" disabled={busy} onClick={connect}><Icon name="refresh" size={14} className={busy ? 'spin' : ''} />Sync now</button>
          <button class="btn sm ghost" onClick={async () => { await disconnect(); q.toast('Disconnected. Your data stays on this device.'); }}>Disconnect</button>
        </div>
      ) : (
        <div class="set-row"><Icon name="google" size={22} /><div class="grow"><div>Not connected</div><div>{googleConfigured() ? 'Your data stays on this device until you connect.' : 'Google sign-in needs a one-time setup (see docs/GOOGLE_SETUP.md), then paste the client ID under Advanced.'}</div></div>
          <button class="btn primary" disabled={busy || !googleConfigured()} onClick={connect}>{busy ? 'Connecting…' : 'Connect Google'}</button></div>
      )}
      <div class="card pad" style="margin:12px 0">
        <div class="small"><b>What goes to Google Calendar</b></div>
        <div class="small muted" style="margin-top:4px">Events you have to show up for (classes, meetings, exams, interviews, conferences), hard deadlines (submissions, applications, fees), and tasks with a specific time. Flexible work — assignments, reading, chores — stays on your Quiet list so your calendar stays honest. You can override this on any item.</div>
      </div>
      <div class="set-row"><div class="grow"><div>Send events & deadlines to Google Calendar</div><div>With reminders: exams a day before and an hour before, deadlines 3 days and 1 day before.</div></div><Switch on={prefs.gcalPush} onChange={v => set('gcalPush', v)} label="Push to Google Calendar" /></div>
      <div class="set-row"><div class="grow"><div>Show my Google Calendar in Quiet</div><div>Your meetings count as busy time when planning.</div></div><Switch on={prefs.gcalPull} onChange={v => set('gcalPull', v)} label="Read Google Calendar" /></div>
      {cals.length > 1 && <div class="set-row" style="align-items:flex-start"><div class="grow"><div>Calendars that count as busy</div>{cals.map(c => <label class="row small" key={c.id} style="margin-top:6px"><input type="checkbox" checked={prefs.gcalReadCalendars.includes(c.id)} onChange={e => set('gcalReadCalendars', e.currentTarget.checked ? [...prefs.gcalReadCalendars, c.id] : prefs.gcalReadCalendars.filter(x => x !== c.id))} /><i class="dot" style={{ background: c.color }} />{c.name}</label>)}</div></div>}
      <div class="set-row"><div class="grow"><div>Bedtime reminder on my phone</div><div>Adds one daily “Wind down” event 30 minutes before {prefs.bedtime}.</div></div><Switch on={prefs.gcalBedtimeEvent} onChange={v => set('gcalBedtimeEvent', v)} label="Bedtime event" /></div>
      {!isDesktop && <details style="margin-top:10px"><summary class="small muted">Advanced</summary>
        <div class="field" style="margin-top:10px"><span class="label">Google OAuth Web client ID</span>
          <div class="row"><input class="input" value={cid} onInput={e => setCid(e.currentTarget.value)} placeholder="123-abc.apps.googleusercontent.com" /><button class="btn" onClick={() => { store.setLocal({ googleClientId: cid.trim() }); q.toast('Saved.'); }}>Save</button></div>
          {isExt && <div class="small muted">Redirect URI to register: <code>{chrome.identity?.getRedirectURL?.() || ''}</code></div>}
          {!isExt && <div class="small muted">Authorized JavaScript origin to register: <code>{location.origin}</code></div>}
        </div></details>}
    </section>
  );
}

function AISection() {
  const q = useQ(), { prefs } = q;
  const [key, setKey] = useState(prefs.aiKey || ''), [status, setStatus] = useState('');
  useEffect(() => setKey(prefs.aiKey || ''), [prefs.aiKey]);
  const prov = PROVIDERS[prefs.aiProvider];
  return (
    <section class="set-sec">
      <h2>AI</h2><p>Quiet works without AI (a built-in sorter handles dates, exams and deadlines). With a key it understands messy dumps, estimates effort better, reads your files and writes your weekly reflection.</p>
      <div class="set-row"><div class="grow"><div>Provider</div>{prov && <div>{prov.note} · <a href={prov.keyUrl} target="_blank" rel="noreferrer">get a key</a></div>}</div>
        <select class="select" style="width:auto" value={prefs.aiProvider} onChange={e => store.setPrefs({ aiProvider: e.currentTarget.value, aiModel: '' })}><option value="none">No AI</option>{Object.entries(PROVIDERS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select></div>
      {prov && <>
        <div class="set-row"><div class="grow"><div>API key</div><div>Synced privately to your devices via your Google Drive app folder.</div></div><input class="input" type="password" style="max-width:260px" value={key} placeholder={prov.keyHint} onInput={e => setKey(e.currentTarget.value)} onChange={e => store.setPref('aiKey', e.currentTarget.value.trim())} /></div>
        <div class="set-row"><div class="grow"><div>Model</div></div><input class="input" list="models" style="max-width:260px" value={prefs.aiModel || prov.models[0]} onChange={e => store.setPref('aiModel', e.currentTarget.value.trim())} /><datalist id="models">{prov.models.map(m => <option key={m} value={m} />)}</datalist></div>
        <div class="set-row"><div class="grow"><div>Test the connection</div><div>{status}</div></div><button class="btn sm" onClick={async () => { setStatus('Checking…'); try { await store.setPref('aiKey', key.trim()); await testAI({ provider: prefs.aiProvider, key: key.trim(), model: prefs.aiModel || prov.models[0] }); setStatus('Connected ✓'); } catch (e) { setStatus(e.message); } }}>Test</button></div>
      </>}
    </section>
  );
}

function InstallSection() {
  const [prompt, setPrompt] = useState(globalThis.__quietInstall || null);
  useEffect(() => { const f = () => setPrompt(globalThis.__quietInstall); addEventListener('quiet-install', f); return () => removeEventListener('quiet-install', f); }, []);
  const webUrl = WEB_APP_URL || (!isExt && !isDesktop ? location.origin + location.pathname : '');
  return (
    <section class="set-sec">
      <h2>Your devices</h2><p>Same account, same plan, everywhere.</p>
      <div class="set-row"><Icon name="sun" /><div class="grow"><div>Phone</div><div>{webUrl ? <>Open <a href={webUrl} target="_blank" rel="noreferrer">{webUrl.replace(/^https?:\/\//, '')}</a> on your phone → Share → <b>Add to Home Screen</b> (iPhone) or menu → <b>Install app</b> (Android).</> : 'Host the web app (see README) and open it on your phone, then Add to Home Screen.'}</div></div></div>
      {!isExt && !isDesktop && !isStandalone && prompt && <div class="set-row"><div class="grow"><div>Install Quiet as an app on this device</div></div><button class="btn primary" onClick={async () => { prompt.prompt(); await prompt.userChoice; globalThis.__quietInstall = null; setPrompt(null); }}>Install</button></div>}
      <div class="set-row"><Icon name="board" /><div class="grow"><div>Laptop</div><div>The Quiet desktop app keeps a small companion on your screen with your next task, and nudges you outside the browser.</div></div></div>
      <div class="set-row"><Icon name="link" /><div class="grow"><div>Browser</div><div>The Chrome extension adds Quiet to your toolbar and brings nudges to the page you're on.</div></div></div>
    </section>
  );
}
