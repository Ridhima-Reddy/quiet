// Drag & drop that works with a mouse AND on phones (long-press to pick up), unlike the native
// HTML5 drag API. Mark draggables with data-drag="<id>" and targets with data-drop="<id>".
// Anything inside [data-nodrag] (checkboxes, buttons) never starts a drag, so ticking always works.
export function initDnd(root, onDrop) {
  let st = null; // {el, id, x0, y0, ghost, over, touch, timer, active, dx, dy}
  const HOLD = 260, SLOP_MOUSE = 5, SLOP_TOUCH = 9;

  const begin = () => {
    const r = st.el.getBoundingClientRect(), g = st.el.cloneNode(true);
    g.classList.add('dnd-ghost'); g.removeAttribute('data-drag');
    Object.assign(g.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', margin: 0, pointerEvents: 'none', zIndex: 9999 });
    st.dx = st.x0 - r.left; st.dy = st.y0 - r.top; st.ghost = g; st.active = true;
    document.body.append(g); st.el.classList.add('dnd-src'); document.documentElement.classList.add('dnd-on');
    try { navigator.vibrate?.(10); } catch {}
  };
  const scrollParent = el => { for (let n = el; n && n !== document.body; n = n.parentElement) { const s = getComputedStyle(n); if (/(auto|scroll)/.test(s.overflowX + s.overflowY) && (n.scrollHeight > n.clientHeight + 2 || n.scrollWidth > n.clientWidth + 2)) return n; } return document.scrollingElement; };
  const move = (x, y) => {
    st.ghost.style.left = x - st.dx + 'px'; st.ghost.style.top = y - st.dy + 'px';
    const hit = document.elementFromPoint(x, y)?.closest('[data-drop]');
    if (hit !== st.over) { st.over?.classList.remove('drop-over'); st.over = hit; hit?.classList.add('drop-over'); }
    // auto-scroll near edges
    const sp = scrollParent(hit || st.el), r = sp === document.scrollingElement ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight } : sp.getBoundingClientRect(), E = 48;
    st.auto = { sp, vx: x < r.left + E ? -12 : x > r.right - E ? 12 : 0, vy: y < r.top + E ? -12 : y > r.bottom - E ? 12 : 0 };
    if ((st.auto.vx || st.auto.vy) && !st.raf) { const loop = () => { if (!st?.auto || (!st.auto.vx && !st.auto.vy)) { if (st) st.raf = 0; return; } st.auto.sp.scrollBy(st.auto.vx, st.auto.vy); st.raf = requestAnimationFrame(loop); }; st.raf = requestAnimationFrame(loop); }
  };
  const end = (drop) => {
    if (!st) return;
    clearTimeout(st.timer);
    if (st.active) {
      const target = st.over?.getAttribute('data-drop'), id = st.id;
      st.ghost.remove(); st.el.classList.remove('dnd-src'); st.over?.classList.remove('drop-over'); document.documentElement.classList.remove('dnd-on');
      // swallow the click that follows a drag
      const swallow = e => { e.stopPropagation(); e.preventDefault(); };
      addEventListener('click', swallow, { capture: true, once: true }); setTimeout(() => removeEventListener('click', swallow, { capture: true }), 50);
      if (drop && target) onDrop(id, target);
    }
    if (st.raf) cancelAnimationFrame(st.raf);
    st = null;
  };

  // Mouse / pen
  root.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    const el = e.target.closest('[data-drag]'); if (!el || e.target.closest('[data-nodrag],input,textarea,select,button,a')) return;
    st = { el, id: el.getAttribute('data-drag'), x0: e.clientX, y0: e.clientY, touch: false };
  });
  addEventListener('pointermove', e => {
    if (!st || st.touch) return;
    if (!st.active) { if (Math.hypot(e.clientX - st.x0, e.clientY - st.y0) < SLOP_MOUSE) return; begin(); }
    e.preventDefault(); move(e.clientX, e.clientY);
  });
  addEventListener('pointerup', () => { if (st && !st.touch) end(true); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && st?.active) end(false); });

  // Touch: long-press to pick up; moving before that is a normal scroll.
  root.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    const el = e.target.closest('[data-drag]'); if (!el || e.target.closest('[data-nodrag],input,textarea,select,button,a')) return;
    const t = e.touches[0];
    st = { el, id: el.getAttribute('data-drag'), x0: t.clientX, y0: t.clientY, touch: true };
    st.timer = setTimeout(() => { if (st && !st.active) { begin(); move(st.x0, st.y0); } }, HOLD);
  }, { passive: true });
  addEventListener('touchmove', e => {
    if (!st?.touch) return;
    const t = e.touches[0];
    if (!st.active) { if (Math.hypot(t.clientX - st.x0, t.clientY - st.y0) > SLOP_TOUCH) { clearTimeout(st.timer); st = null; } return; }
    e.preventDefault(); move(t.clientX, t.clientY);
  }, { passive: false });
  addEventListener('touchend', () => { if (st?.touch) end(true); });
  addEventListener('touchcancel', () => { if (st?.touch) end(false); });
  root.addEventListener('contextmenu', e => { if (st?.touch) e.preventDefault(); });
}
