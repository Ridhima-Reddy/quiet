// Tiny canvas confetti. Muted colours so it feels like a small celebration, not a casino.
const COLORS = ['#6E9A7E', '#E3B26B', '#D98E7E', '#8C9BC4', '#B7A6D6', '#E9D8B4', '#7FB3A8'];
let canvas, ctx, parts = [], raf = 0;

function ensure(doc) {
  if (canvas && canvas.isConnected) return;
  canvas = doc.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '2147483646' });
  (doc.body || doc.documentElement).append(canvas);
  ctx = canvas.getContext('2d');
}
function frame() {
  const dpr = devicePixelRatio || 1, W = innerWidth, H = innerHeight;
  if (canvas.width !== W * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  parts = parts.filter(p => p.life > 0 && p.y < H + 40);
  for (const p of parts) {
    p.vy += p.g; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 1;
    const a = Math.min(1, p.life / 30);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
    if (p.shape === 0) ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
    else if (p.shape === 1) { ctx.beginPath(); ctx.arc(0, 0, p.s / 3, 0, 6.283); ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(0, -p.s / 2); ctx.lineTo(p.s / 2.4, p.s / 3); ctx.lineTo(-p.s / 2.4, p.s / 3); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  if (parts.length) raf = requestAnimationFrame(frame); else { raf = 0; ctx.clearRect(0, 0, W, H); }
}
/** Burst from a point (e.g. the checkbox you just ticked). big = whole-screen celebration. */
export function confetti({ x, y, big = false, doc = document } = {}) {
  if (matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  ensure(doc);
  const n = big ? 140 : 42;
  for (let i = 0; i < n; i++) {
    const fromTop = big && i % 2 === 0;
    const ang = fromTop ? Math.PI / 2 + (Math.random() - 0.5) * 0.9 : -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const sp = fromTop ? 2 + Math.random() * 3 : (big ? 7 : 4.5) + Math.random() * (big ? 7 : 5);
    parts.push({
      x: fromTop ? Math.random() * innerWidth : (x ?? innerWidth / 2), y: fromTop ? -20 : (y ?? innerHeight / 2),
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: 0.16 + Math.random() * 0.08, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
      s: 6 + Math.random() * 6, c: COLORS[(Math.random() * COLORS.length) | 0], shape: (Math.random() * 3) | 0, life: (big ? 150 : 85) + Math.random() * 40,
    });
  }
  if (!raf) raf = requestAnimationFrame(frame);
}
