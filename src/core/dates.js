// Date helpers. Dates are local-time ISO strings 'YYYY-MM-DD'; times are 'HH:MM'.
export const pad = n => String(n).padStart(2, '0');
export const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const pd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return iso(d); };
export const todayISO = (now = new Date()) => iso(now);
export const dow = s => pd(s).getDay();
export const mondayOf = s => addDays(s, -((dow(s) + 6) % 7));
export const daysBetween = (a, b) => Math.round((pd(b) - pd(a)) / 864e5);
export const isISODate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isTime = s => typeof s === 'string' && /^\d{1,2}:\d{2}$/.test(s);
export const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const fromMin = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
export const nowMin = (now = new Date()) => now.getHours() * 60 + now.getMinutes();
export const range = (a, b) => { const out = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out; };

export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const fmtMin = m => {
  m = Math.round(m || 0);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
};
export const fmtTime = t => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number), ap = h >= 12 ? 'pm' : 'am', hh = h % 12 || 12;
  return m ? `${hh}:${pad(m)}${ap}` : `${hh}${ap}`;
};
/** Friendly relative label: Today, Tomorrow, Yesterday, Fri, Fri 21 Nov */
export const relDay = (s, today = todayISO()) => {
  const n = daysBetween(today, s);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  const d = pd(s);
  if (n > 1 && n < 7) return DOW[d.getDay()];
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
};
export const longDate = s => { const d = pd(s); return `${DOW_LONG[d.getDay()]}, ${d.getDate()} ${MON_LONG[d.getMonth()]}`; };
export const shortDate = s => { const d = pd(s); return `${d.getDate()} ${MON[d.getMonth()]}`; };
export const partOfDay = (now = new Date()) => {
  const h = now.getHours();
  return h < 5 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 22 ? 'evening' : 'night';
};
