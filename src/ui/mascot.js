// Minimal flat companions: one soft shape, dot eyes, a little blush. Framework-free so the
// content script (nudges on web pages) and the desktop widget can use the same drawing.
export const MASCOT_COLORS = {
  moss: { body: '#CFE0D3', shade: '#B9D0BF', accent: '#6E9A7E' },
  cat: { body: '#EBCFAE', shade: '#DDBB95', accent: '#E9A9A0' },
  bunny: { body: '#EEE7E2', shade: '#DDD3CC', accent: '#EBB3B0' },
  bear: { body: '#CBA88B', shade: '#B79274', accent: '#E9D3BD' },
  owl: { body: '#BDB8DC', shade: '#A7A1CC', accent: '#F2E8D5' },
  duck: { body: '#F3DD93', shade: '#E7C970', accent: '#F0A458' },
};
const INK = '#2B2A27', BLUSH = '#F1A39B';

export function mascotSVG(type = 'moss', { size = 64, title = '' } = {}) {
  if (type === 'none') return '';
  const c = MASCOT_COLORS[type] || MASCOT_COLORS.moss;
  let back = '', top = '', face = '';
  const eyes = (y = 58, dx = 10) => `<g class="q-eyes"><ellipse cx="${50 - dx}" cy="${y}" rx="2.6" ry="3.3" fill="${INK}"/><ellipse cx="${50 + dx}" cy="${y}" rx="2.6" ry="3.3" fill="${INK}"/></g>
    <g class="q-closed"><path d="M${47 - dx} ${y} q3 2.6 6 0" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M${47 + dx} ${y} q3 2.6 6 0" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/></g>`;
  const blush = (y = 65) => `<ellipse cx="33" cy="${y}" rx="4.6" ry="2.6" fill="${BLUSH}" opacity=".55"/><ellipse cx="67" cy="${y}" rx="4.6" ry="2.6" fill="${BLUSH}" opacity=".55"/>`;
  const mouth = (y = 66) => `<path class="q-mouth" d="M47 ${y} q3 3 6 0" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
  if (type === 'moss') {
    top = `<g class="q-sprout"><path d="M50 37 C50 32 50 29 50 25" stroke="${c.accent}" stroke-width="2.2" stroke-linecap="round" fill="none"/>
      <path d="M50 28 C44 27 40 23 39 18 C45 18 49 22 50 28Z" fill="${c.accent}"/><path d="M50 26 C55 24 59 20 61 15 C55 15 51 19 50 26Z" fill="${c.accent}" opacity=".85"/></g>`;
    face = eyes() + blush() + mouth();
  } else if (type === 'cat') {
    back = `<path d="M60 84 C76 86 82 74 80 66" stroke="${c.shade}" stroke-width="6" stroke-linecap="round" fill="none" class="q-tail"/>`;
    top = `<g class="q-ears"><path d="M26 50 L29 27 L45 40 Z" fill="${c.body}"/><path d="M31 44 L32 33 L40 40 Z" fill="${c.accent}"/>
      <path d="M74 50 L71 27 L55 40 Z" fill="${c.body}"/><path d="M69 44 L68 33 L60 40 Z" fill="${c.accent}"/></g>`;
    face = eyes() + blush() + `<path d="M48.5 63 h3 l-1.5 1.8z" fill="${INK}"/>` + mouth(66) + `<g stroke="${INK}" stroke-width=".9" opacity=".35" stroke-linecap="round"><path d="M22 62 h8"/><path d="M23 66 l7 -1"/><path d="M78 62 h-8"/><path d="M77 66 l-7 -1"/></g>`;
  } else if (type === 'bunny') {
    top = `<g class="q-ears"><g transform="rotate(-9 40 38)"><rect x="34" y="6" width="12" height="38" rx="6" fill="${c.body}"/><rect x="37.5" y="11" width="5" height="26" rx="2.5" fill="${c.accent}" opacity=".8"/></g>
      <g transform="rotate(9 60 38)"><rect x="54" y="6" width="12" height="38" rx="6" fill="${c.body}"/><rect x="57.5" y="11" width="5" height="26" rx="2.5" fill="${c.accent}" opacity=".8"/></g></g>`;
    back = `<circle cx="79" cy="78" r="6" fill="#fff" opacity=".9"/>`;
    face = eyes() + blush() + `<ellipse cx="50" cy="63.5" rx="2" ry="1.4" fill="${c.accent}"/>` + mouth(66.5);
  } else if (type === 'bear') {
    top = `<g class="q-ears"><circle cx="29" cy="41" r="9" fill="${c.body}"/><circle cx="29" cy="41" r="4.5" fill="${c.shade}"/><circle cx="71" cy="41" r="9" fill="${c.body}"/><circle cx="71" cy="41" r="4.5" fill="${c.shade}"/></g>`;
    face = `<ellipse cx="50" cy="66" rx="9" ry="6.5" fill="${c.accent}"/>` + eyes(57) + blush(66) + `<ellipse cx="50" cy="63.5" rx="2.6" ry="1.8" fill="${INK}"/>` + mouth(67.5);
  } else if (type === 'owl') {
    top = `<g class="q-ears"><path d="M28 44 L30 30 L40 40 Z" fill="${c.shade}"/><path d="M72 44 L70 30 L60 40 Z" fill="${c.shade}"/></g>`;
    face = `<ellipse cx="50" cy="74" rx="15" ry="11" fill="${c.accent}" opacity=".7"/><circle cx="40" cy="57" r="7.5" fill="#FBF8F2"/><circle cx="60" cy="57" r="7.5" fill="#FBF8F2"/>` + eyes(57) + `<path d="M47.5 63 L50 67.5 L52.5 63 Z" fill="#E8A35A"/>`;
  } else if (type === 'duck') {
    top = `<path class="q-ears" d="M50 37 C47 31 51 27 55 29 C52 30 51 33 52 37Z" fill="${c.shade}"/>`;
    face = eyes(56) + blush(64) + `<ellipse cx="50" cy="65" rx="7" ry="3.6" fill="${c.accent}"/><path d="M44 65 h12" stroke="#D88A3E" stroke-width=".9"/>`;
  }
  return `<svg class="q-mascot q-${type}" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${title || type}">
  <ellipse class="q-shadow" cx="50" cy="93" rx="25" ry="3.6" fill="#000" opacity=".10"/>
  <g class="q-hop"><g class="q-body">${back}${top}
    <path d="M50 37 C70 37 82 52 82 68 C82 83 68 90 50 90 C32 90 18 83 18 68 C18 52 30 37 50 37Z" fill="${c.body}"/>
    <path d="M24 74 C28 86 40 90 50 90 C64 90 76 85 80 74 C74 82 64 86 50 86 C38 86 29 82 24 74Z" fill="${c.shade}" opacity=".7"/>
    <g class="q-face">${face}</g></g></g>
  <g class="q-zzz"><text x="74" y="34" font-size="11" font-family="system-ui" fill="${INK}" opacity=".5">z</text><text x="82" y="24" font-size="8" font-family="system-ui" fill="${INK}" opacity=".35">z</text></g>
</svg>`;
}

export const MASCOT_CSS = `
.q-mascot{overflow:visible;display:block}
.q-mascot .q-body{transform-origin:50px 90px;animation:q-breathe 3.8s ease-in-out infinite}
.q-mascot .q-eyes{transform-box:fill-box;transform-origin:center;animation:q-blink 5.2s infinite;transform:translate(calc(var(--lx,0)*1px),calc(var(--ly,0)*1px))}
.q-mascot .q-closed,.q-mascot .q-zzz{display:none}
.q-mascot .q-sprout{transform-origin:50px 37px;animation:q-sway 4.6s ease-in-out infinite}
.q-mascot .q-ears{transform-origin:50px 45px;animation:q-twitch 7s ease-in-out infinite}
.q-mascot .q-tail{transform-origin:62px 84px;animation:q-sway 3s ease-in-out infinite}
.cheer .q-mascot .q-hop,.q-mascot.cheer .q-hop{animation:q-hop .7s cubic-bezier(.3,.7,.4,1) 2}
.sleep .q-mascot .q-eyes{display:none}.sleep .q-mascot .q-closed{display:inline}
.sleep .q-mascot .q-zzz{display:inline;animation:q-z 3s ease-in-out infinite}.sleep .q-mascot .q-body{animation-duration:6s}
.happy .q-mascot .q-eyes{display:none}.happy .q-mascot .q-closed{display:inline}
@keyframes q-breathe{50%{transform:scale(1.025,.975)}}
@keyframes q-blink{0%,93%,100%{transform:translate(calc(var(--lx,0)*1px),calc(var(--ly,0)*1px)) scaleY(1)}95%{transform:translate(calc(var(--lx,0)*1px),calc(var(--ly,0)*1px)) scaleY(.1)}}
@keyframes q-sway{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(5deg)}}
@keyframes q-twitch{0%,88%,100%{transform:rotate(0)}91%{transform:rotate(-3deg)}94%{transform:rotate(2deg)}}
@keyframes q-hop{0%,100%{transform:translateY(0) scale(1)}25%{transform:translateY(2px) scale(1.06,.94)}55%{transform:translateY(-12px) scale(.96,1.05)}80%{transform:translateY(0) scale(1.03,.97)}}
@keyframes q-z{0%{transform:translate(0,4px);opacity:0}30%{opacity:1}100%{transform:translate(4px,-6px);opacity:0}}
@media (prefers-reduced-motion:reduce){.q-mascot *{animation:none!important}}
`;

/** Eyes follow the pointer a little. Returns a cleanup function. */
export function followPointer(el, root = document) {
  const f = e => { const r = el.getBoundingClientRect(); if (!r.width) return; const dx = (e.clientX - (r.left + r.width / 2)) / 400, dy = (e.clientY - (r.top + r.height / 2)) / 400; el.style.setProperty('--lx', Math.max(-1, Math.min(1, dx)) * 2.2); el.style.setProperty('--ly', Math.max(-1, Math.min(1, dy)) * 1.8); };
  root.addEventListener('pointermove', f, { passive: true });
  return () => root.removeEventListener('pointermove', f);
}
export function cheer(el) { if (!el) return; el.classList.remove('cheer'); void el.offsetWidth; el.classList.add('cheer'); setTimeout(() => el.classList.remove('cheer'), 1500); }
