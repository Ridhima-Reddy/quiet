// Shows companion nudges on the page you're browsing, inside a shadow root so page styles can't touch it.
import { mascotSVG, MASCOT_CSS, cheer } from '../ui/mascot.js';
import { confetti } from '../ui/confetti.js';

if (!window.__quietNudges) {
  window.__quietNudges = true;
  const CSS = `:host{all:initial}
  .wrap{position:fixed;right:20px;bottom:18px;z-index:2147483647;display:flex;align-items:flex-end;gap:8px;font:14px/1.45 "Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,sans-serif;animation:in .45s cubic-bezier(.2,.8,.2,1) both;color-scheme:light dark}
  .wrap.out{animation:out .35s ease-in both}
  .b{max-width:280px;background:#fff;color:#1E1E1B;border:1px solid #E6E4DE;border-radius:16px 16px 4px 16px;padding:12px 14px;box-shadow:0 2px 6px rgba(0,0,0,.05),0 14px 40px rgba(0,0,0,.14);margin-bottom:42px}
  .n{display:block;font-weight:600;font-size:12px;color:#4E7360;margin-bottom:2px}
  .acts{display:flex;gap:6px;margin-top:10px}
  button{font:inherit;font-size:12.5px;font-weight:500;border:1px solid #DAD7CF;background:#fff;color:#1E1E1B;border-radius:999px;height:28px;padding:0 12px;cursor:pointer}
  button.p{background:#4E7360;border-color:#4E7360;color:#fff}
  button:hover{filter:brightness(.97)}
  .pet{cursor:pointer;filter:drop-shadow(0 6px 10px rgba(0,0,0,.12))}
  .x{position:absolute;top:6px;right:8px;border:0;background:transparent;height:auto;padding:0;color:#8E8C85;font-size:16px;line-height:1}
  .b{position:relative}
  @media (prefers-color-scheme:dark){.b{background:#1A1A18;color:#ECEBE6;border-color:#2A2A27}button{background:#222220;color:#ECEBE6;border-color:#34342F}button.p{background:#8DB89F;border-color:#8DB89F;color:#10150F}.n{color:#8DB89F}}
  @keyframes in{from{opacity:0;transform:translateY(24px)}}@keyframes out{to{opacity:0;transform:translateY(40px)}}
  ${MASCOT_CSS}`;
  let host = null, timer = 0;
  const close = () => { if (!host) return; const h = host; host = null; clearTimeout(timer); h.shadowRoot.querySelector('.wrap')?.classList.add('out'); setTimeout(() => h.remove(), 360); };
  const send = (action, nudge, extra = {}) => { try { chrome.runtime.sendMessage({ type: 'nudge-action', action, nudge, ...extra }); } catch {} };
  const chime = () => { try { const c = new AudioContext(); [[784, 0], [988, .14], [1175, .28]].forEach(([f, t]) => { const o = c.createOscillator(), g = c.createGain(), s = c.currentTime + t; o.frequency.value = f; g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(.05, s + .02); g.gain.exponentialRampToValueAtTime(.0005, s + .6); o.connect(g).connect(c.destination); o.start(s); o.stop(s + .65); }); setTimeout(() => c.close(), 1500); } catch {} };
  chrome.runtime.onMessage.addListener(m => {
    if (m?.type !== 'nudge') return;
    close();
    host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const [b1, b2] = m.buttons || ['Done', 'Later'];
    root.innerHTML = `<style>${CSS}</style><div class="wrap" role="status"><div class="b"><button class="x" aria-label="Close">×</button><span class="n"></span><span class="t"></span><div class="acts"><button class="p a1"></button><button class="a2"></button></div></div>${m.companion === 'none' ? '' : `<div class="pet">${mascotSVG(m.companion || 'moss', { size: 72 })}</div>`}</div>`;
    root.querySelector('.n').textContent = m.title || m.name || 'Quiet';
    root.querySelector('.t').textContent = m.text || '';
    root.querySelector('.a1').textContent = b1; root.querySelector('.a2').textContent = b2;
    const pet = root.querySelector('.pet');
    root.querySelector('.x').onclick = () => close();
    root.querySelector('.a1').onclick = e => {
      if (m.type === 'brief') send('open', m, { hash: '#/today' });
      else if (m.type === 'focus-end') send(b1 === 'Start break' ? 'start-break' : 'start-focus', m);
      else { const r = e.currentTarget.getBoundingClientRect(); confetti({ x: r.left + r.width / 2, y: r.top }); send('done', m); }
      cheer(pet); setTimeout(close, 700);
    };
    root.querySelector('.a2').onclick = () => { send('later', m); close(); };
    if (pet) pet.onclick = () => cheer(pet);
    document.documentElement.append(host);
    if (m.sound) chime();
    timer = setTimeout(close, m.type === 'brief' ? 40000 : 25000);
  });
}
