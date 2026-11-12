// Soft sounds made with WebAudio (no files). Quiet by design: low volume, short.
let ac = null;
const ctx = () => { try { ac = ac || new (globalThis.AudioContext || globalThis.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac; } catch { return null; } };
function tone(c, f, t, dur, vol = 0.06, type = 'sine', to = null) {
  const o = c.createOscillator(), g = c.createGain(), s = c.currentTime + t;
  o.type = type; o.frequency.setValueAtTime(f, s); if (to) o.frequency.exponentialRampToValueAtTime(to, s + dur * 0.6);
  g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(vol, s + 0.012); g.gain.exponentialRampToValueAtTime(0.0005, s + dur);
  o.connect(g).connect(c.destination); o.start(s); o.stop(s + dur + 0.05);
}
export const sounds = {
  tick() { const c = ctx(); if (c) { tone(c, 880, 0, 0.12, 0.05, 'sine', 1320); tone(c, 1760, 0.05, 0.1, 0.018); } },
  done() { const c = ctx(); if (c) [[659, 0], [880, 0.09], [1175, 0.18]].forEach(([f, t]) => tone(c, f, t, 0.5, 0.045)); },
  chime() { const c = ctx(); if (c) [[784, 0], [988, 0.15], [1175, 0.3]].forEach(([f, t]) => tone(c, f, t, 0.7, 0.05)); },
  soft() { const c = ctx(); if (c) tone(c, 523, 0, 0.35, 0.03); },
};
export const haptic = (ms = 8) => { try { navigator.vibrate?.(ms); } catch {} };
