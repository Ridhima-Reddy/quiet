import { useState } from 'preact/hooks';
import { useQ } from '../ctx.jsx';
import { Icon } from '../icons.jsx';
import { Mascot } from '../components.jsx';
import { store } from '../../core/store.js';
import { uid, COMPANIONS } from '../../core/model.js';
import { getToken, googleConfigured } from '../../google/auth.js';
import { syncNow } from '../../google/sync.js';

const IDEAS = ['Become a better researcher', 'Stay physically healthy', 'Keep in touch with family & friends', 'Land a great internship', 'Make time to create', 'Sleep well'];

export function Onboarding() {
  const q = useQ(), { prefs } = q;
  const [step, setStep] = useState(0);
  const [name, setName] = useState(prefs.name || store.local.google?.name?.split(' ')[0] || '');
  const [pet, setPet] = useState(prefs.companion || 'moss');
  const [goals, setGoals] = useState([]);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const finish = async () => {
    await store.setPrefs({ name: name.trim(), companion: pet });
    if (goals.length) await store.write(goals.map((g, i) => ({ c: 'goals', rec: { id: uid('g'), name: g, order: i } })));
    await store.setLocal({ onboarded: true });
    q.close(); q.open('dump');
  };
  const skip = async () => { await store.setLocal({ onboarded: true }); q.close(); };
  const companionName = COMPANIONS.find(c => c.id === pet)?.name;
  return (
    <>
      <div class="scrim" />
      <div class="sheet modal" role="dialog" aria-label="Welcome to Quiet" style="max-width:520px">
        <div class="sb" style="padding:28px 28px 8px;text-align:center">
          <div style="display:flex;justify-content:center;margin-bottom:8px"><Mascot type={pet === 'none' ? 'moss' : pet} size={84} /></div>
          {step === 0 && <>
            <h2 class="serif" style="font-weight:400;font-size:26px;margin:0 0 6px">Hi, I'm {pet === 'none' ? 'Quiet' : companionName}.</h2>
            <p class="muted" style="margin:0 0 18px">I'll hold the things on your mind so you don't have to — and make sure you eat, rest and sleep while you get through them.</p>
            <input class="input" autofocus style="text-align:center;font-size:16px;max-width:280px" placeholder="What should I call you?" value={name} onInput={e => setName(e.currentTarget.value)} onKeyDown={e => e.key === 'Enter' && setStep(1)} />
            <div class="pets" style="justify-content:center;margin-top:18px">{COMPANIONS.filter(c => c.id !== 'none').map(c => <button key={c.id} class={pet === c.id ? 'on' : ''} onClick={() => setPet(c.id)}><Mascot type={c.id} size={40} />{c.name}</button>)}</div>
          </>}
          {step === 1 && <>
            <h2 class="serif" style="font-weight:400;font-size:24px;margin:0 0 6px">What matters to you right now?</h2>
            <p class="muted" style="margin:0 0 16px">Pick a few. I'll favour these when you have room, and show you where your time actually goes.</p>
            <div class="seg" style="justify-content:center">{IDEAS.map(g => <button key={g} class={goals.includes(g) ? 'on' : ''} onClick={() => setGoals(x => x.includes(g) ? x.filter(y => y !== g) : [...x, g])}>{g}</button>)}{goals.filter(g => !IDEAS.includes(g)).map(g => <button key={g} class="on" onClick={() => setGoals(x => x.filter(y => y !== g))}>{g}</button>)}</div>
            <div class="row" style="margin-top:12px;max-width:380px;margin-inline:auto"><input class="input" placeholder="Something else…" value={custom} onInput={e => setCustom(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter' && custom.trim()) { setGoals(x => [...x, custom.trim()]); setCustom(''); } }} /><button class="btn" onClick={() => { if (custom.trim()) { setGoals(x => [...x, custom.trim()]); setCustom(''); } }}>Add</button></div>
          </>}
          {step === 2 && <>
            <h2 class="serif" style="font-weight:400;font-size:24px;margin:0 0 6px">Use Quiet everywhere?</h2>
            <p class="muted" style="margin:0 0 16px">Connect your Google account to sync your laptop, phone and browser, and to put exams, meetings and deadlines on your Google Calendar so your phone reminds you.</p>
            <button class="btn primary lg" disabled={busy || !googleConfigured()} onClick={async () => { setBusy(true); try { if (await getToken({ interactive: true })) { await syncNow(); q.toast('Connected.'); finish(); } } catch (e) { q.toast(e.message); } finally { setBusy(false); } }}><Icon name="google" size={16} />{busy ? 'Connecting…' : 'Connect Google'}</button>
            {!googleConfigured() && <p class="small muted">Google sign-in isn't set up on this build yet — you can connect later in You.</p>}
          </>}
        </div>
        <div class="sf" style="border:0;padding:16px 28px 22px">
          <button class="btn ghost" onClick={skip}>Skip</button><span class="grow" />
          <span class="muted small">{step + 1} / 3</span>
          {step < 2 ? <button class="btn primary" onClick={() => setStep(step + 1)}>Next</button> : <button class="btn" onClick={finish}>{store.local.google?.connected ? 'Start' : 'Maybe later'}</button>}
        </div>
      </div>
    </>
  );
}
