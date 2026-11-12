// Brain dump -> structured items. Uses the AI when a key is set; otherwise a careful offline parser,
// so Quiet is useful from the first minute without any setup.
import { addDays, todayISO, dow, pd, iso, mondayOf, DOW_LONG, isISODate, isTime, pad } from './dates.js';
import { llmJSON, aiReady } from './llm.js';
import { makeItem, guessLoad, uid } from './model.js';

const EVENT_RX = /\b(exam|mid-?sem|end-?sem|midterm|finals?|quiz|test|viva|interview|meeting|meet with|call with|class|lecture|lab session|tutorial|seminar|workshop|conference|symposium|webinar|appointment|doctor|dentist|flight|train|bus to|party|wedding|birthday|dinner with|lunch with|presentation day|orientation|hackathon|fest)\b/i;
const EXAM_RX = /\b(exam|mid-?sem|end-?sem|midterm|finals?|quiz|test|viva)\b/i;
const HARD_RX = /\b(due|deadline|submit|submission|apply|application|register|registration|last date|closes|fees?|pay|form|portal|sop|statement of purpose|essay for|abstract)\b/i;
const WORRY_RX = /\b(worr(y|ied|ying)|anxious|anxiety|stress(ed|ful)?|scared|afraid|overwhelm(ed|ing)?|nervous|panic|can'?t stop thinking|feel(ing)? (bad|guilty|lost|behind|lonely)|not sure (if|whether)|what if)\b/i;
const HABIT_RX = /\b(every ?day|daily|each day|(\d|one|two|three|four|five|six)\s*(x|times)\s*(a|per)\s*week|every (morning|night|evening)|regularly)\b/i;
const WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

function effortGuess(l) {
  if (EXAM_RX.test(l) && /(study|prep|revise|revision)/.test(l)) return 360;
  if (/\b(read|skim|go through)\b/.test(l) && /\b(paper|article|chapter|notes)\b/.test(l)) return 90;
  if (/\b(thesis|dissertation|research paper|manuscript)\b/.test(l)) return 360;
  if (/\b(report|essay|project|sop|statement of purpose|application|proposal|paper)\b/.test(l)) return 240;
  if (/\b(assignment|problem set|pset|homework|hw|lab report|tutorial sheet)\b/.test(l)) return 180;
  if (/\b(presentation|slides|deck|poster)\b/.test(l)) return 150;
  if (/\b(read|reading|chapter|watch lecture|lecture notes|revise|review)\b/.test(l)) return 60;
  if (/\b(email|mail|text|message|reply|whatsapp|call|ping|remind)\b/.test(l)) return 10;
  if (/\b(buy|order|pay|book|recharge|print|pick up|drop off|return)\b/.test(l)) return 15;
  if (/\b(laundry|clean|tidy|groceries|cook)\b/.test(l)) return 40;
  return 30;
}
function durationIn(l) {
  const h = l.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/); if (h) return Math.round(parseFloat(h[1]) * 60);
  const m = l.match(/(\d+)\s*(?:m|min|mins|minutes)\b/); if (m) return +m[1];
  return null;
}
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Find a date in free text. Day-first numeric dates (12/11 = 12 Nov), as used in India/UK. */
export function findDate(l, today = todayISO()) {
  const t = pd(today);
  const fix = (y, m, d) => { const x = new Date(y, m, d); if (x.getMonth() !== m) return null; let s = iso(x); if (s < today && y === t.getFullYear() && !/\d{4}/.test(l)) s = iso(new Date(y + 1, m, d)); return s; };
  let m;
  if ((m = l.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if (/\b(today|tonight|this evening|this afternoon|eod)\b/.test(l)) return today;
  if (/\bday after tomorrow\b/.test(l)) return addDays(today, 2);
  if (/\b(tomorrow|tmrw|tmr)\b/.test(l)) return addDays(today, 1);
  if ((m = l.match(/\bin (\d+|a|one|two|three) (day|days|week|weeks)\b/))) { const n = m[1] === 'a' ? 1 : WORDNUM[m[1]] || +m[1]; return addDays(today, n * (m[2].startsWith('week') ? 7 : 1)); }
  if ((m = l.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:,?\s*(\d{4}))?/))) return fix(+(m[3] || t.getFullYear()), MONTHS.indexOf(m[2].slice(0, 3)), +m[1]);
  if ((m = l.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/))) return fix(+(m[3] || t.getFullYear()), MONTHS.indexOf(m[1].slice(0, 3)), +m[2]);
  if ((m = l.match(/\b(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?\b/)) && +m[2] <= 12) return fix(m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : t.getFullYear(), +m[2] - 1, +m[1]);
  const names = DOW_LONG.map(d => d.toLowerCase());
  for (let i = 0; i < 7; i++) {
    const rx = new RegExp(`\\b(next |this |on |by |coming )?(${names[i]}|${names[i].slice(0, 3)})\\b`);
    if ((m = l.match(rx))) {
      if (m[1] === 'next ') return addDays(mondayOf(addDays(today, 7)), (i + 6) % 7);
      const k = (i - dow(today) + 7) % 7; return addDays(today, k || 7);
    }
  }
  if (/\b(this weekend|the weekend)\b/.test(l)) return addDays(today, (6 - dow(today) + 7) % 7 || 7);
  if (/\bnext week\b/.test(l)) return addDays(mondayOf(addDays(today, 7)), 0);
  if (/\b(end of (the )?week|this week|by friday)\b/.test(l)) return addDays(today, (5 - dow(today) + 7) % 7);
  if (/\b(end of (the )?month|this month)\b/.test(l)) return iso(new Date(t.getFullYear(), t.getMonth() + 1, 0));
  if (/\bnext month\b/.test(l)) return iso(new Date(t.getFullYear(), t.getMonth() + 1, 1));
  return null;
}
export function findTime(l) {
  let m;
  if (/\bnoon\b/.test(l)) return '12:00';
  if ((m = l.match(/\b(\d{1,2})(?::|\.)(\d{2})\s*(am|pm)\b/))) return `${pad((+m[1] % 12) + (m[3] === 'pm' ? 12 : 0))}:${m[2]}`;
  if ((m = l.match(/\b(\d{1,2})\s*(am|pm)\b/))) return `${pad((+m[1] % 12) + (m[2] === 'pm' ? 12 : 0))}:00`;
  if ((m = l.match(/\b(?:at|@|by|from)\s*(\d{1,2}):(\d{2})\b/)) || (m = l.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/))) return `${pad(+m[1])}:${m[2]}`;
  if ((m = l.match(/\bat (\d{1,2})\b(?!\s*(?:st|nd|rd|th|\/|\.|\d))/))) { let h = +m[1]; if (h >= 1 && h <= 7) h += 12; return `${pad(h)}:00`; }
  return null;
}
function cleanTitle(s) {
  let t = s.replace(/^\s*[-*•\d.)]+\s*/, '')
    .replace(/\b(i (really )?(need|have|want|got) to|i should|i must|i gotta|gotta|have to|need to|remember to|don'?t forget to|also|then|and then|plus)\b/gi, '')
    .replace(/\b(by |on |before |due |this |next |coming )?(today|tonight|tomorrow|tmrw|day after tomorrow|(mon|tues|wednes|thurs|fri|satur|sun)day|next week|this week(end)?|end of (the )?(week|month))\b/gi, '')
    .replace(/\b(at|by|from)?\s*\d{1,2}(:\d{2})?\s*(am|pm)\b/gi, '').replace(/\b(in \d+ (days?|weeks?))\b/gi, '')
    .replace(/\b(on |by )?\d{1,2}(st|nd|rd|th)?\s+(of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/gi, '')
    .replace(/\b(for )?\d+(\.\d+)?\s*(h|hr|hrs|hours?|m|mins?|minutes)\b/gi, '')
    .replace(/\b(by |on |before |due |till |until )?(the )?\d{1,2}[\/.]\d{1,2}([\/.]\d{2,4})?\b/gi, '').replace(/\b(by|on|before|due|till|until) the \d{1,2}(st|nd|rd|th)\b/gi, '')
    .replace(/\s+(by|on|before|at|due)\s*$/i, '')
    .replace(/\s{2,}/g, ' ').replace(/^[\s,;:-]+|[\s,;:-]+$/g, '').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}
function splitDump(d) {
  return d.split(/\n+|;|(?<=[a-z0-9)])\.\s+(?=[A-Za-z])|\s+(?:and also|also|plus|and then)\s+|,\s*(?=(?:and\s+)?(?:i |i'm |need |have |finish |submit |call |email |write |read |study |prepare |book |buy |send |reply |go |meet |do |start |pay |apply ))/i)
    .map(s => s && s.trim()).filter(s => s && s.length > 2);
}

export function offlineExtract(dump, goals, today = todayISO()) {
  const items = [], concerns = [], habits = [];
  for (const raw of splitDump(dump)) {
    const l = raw.toLowerCase();
    if (WORRY_RX.test(l) && !HARD_RX.test(l) && !EVENT_RX.test(l)) { concerns.push(raw.replace(/^i'?m\s+/i, '').trim()); continue; }
    if (HABIT_RX.test(l) && /\b(gym|run|walk|read|meditat|yoga|sleep|journal|exercise|workout|swim|practice|water)\b/.test(l)) {
      const n = l.match(/(\d|one|two|three|four|five|six)\s*(x|times)/); habits.push({ name: cleanTitle(raw.replace(HABIT_RX, '')) || cleanTitle(raw), perWeek: n ? (WORDNUM[n[1]] || +n[1]) : 7 }); continue;
    }
    const date = findDate(l, today), time = findTime(l), dur = durationIn(l), title = cleanTitle(raw);
    if (!title) continue;
    const goalIds = goals.filter(g => g.name.toLowerCase().split(/\W+/).some(w => w.length > 3 && l.includes(w))).map(g => g.id);
    const isEvent = EVENT_RX.test(l) && !/\b(prepare|study for|revise for|prep for|write|finish|submit|make slides)\b/.test(l);
    if (isEvent) {
      const ev = { tmp: uid('x'), title, kind: 'event', date: date || null, time, endTime: time && dur ? addMin(time, dur) : null, goals: goalIds, src: 'dump' };
      items.push(ev);
      if (EXAM_RX.test(l) && date) items.push({ title: `Prepare for ${title.replace(/^(the|my)\s+/i, '')}`, kind: 'task', due: date, effort: 360, load: 'deep', prepForTmp: ev.tmp, goals: goalIds, src: 'dump' });
      continue;
    }
    const effort = dur || effortGuess(l);
    items.push({ title, kind: 'task', due: date && date < today ? today : date, dueTime: time, hard: !!date && HARD_RX.test(l), effort, load: guessLoad(effort), goals: goalIds, src: 'dump' });
  }
  return { items, concerns, habits };
}
const addMin = (t, m) => { const [h, mm] = t.split(':').map(Number), x = h * 60 + mm + m; return `${pad(Math.floor(x / 60) % 24)}:${pad(x % 60)}`; };

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items', 'concerns', 'habits'],
  properties: {
    items: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['title', 'kind', 'hard_deadline', 'due', 'due_time', 'date', 'time', 'end_time', 'end_date', 'effort_min', 'load', 'goals', 'prep_for'],
      properties: {
        title: { type: 'string' }, kind: { type: 'string', enum: ['task', 'event'] }, hard_deadline: { type: 'boolean' },
        due: { type: ['string', 'null'] }, due_time: { type: ['string', 'null'] }, date: { type: ['string', 'null'] }, time: { type: ['string', 'null'] },
        end_time: { type: ['string', 'null'] }, end_date: { type: ['string', 'null'] }, effort_min: { type: 'integer' },
        load: { type: 'string', enum: ['light', 'medium', 'deep'] }, goals: { type: 'array', items: { type: 'string' } }, prep_for: { type: ['string', 'null'] },
      } } },
    concerns: { type: 'array', items: { type: 'string' } },
    habits: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'per_week'], properties: { name: { type: 'string' }, per_week: { type: 'integer' } } } },
  },
};

export async function extract(dump, { goals = [], existing = [], attachments = [], today = todayISO() } = {}) {
  const t0 = Date.now();
  if (!aiReady()) return { ...offlineExtract(dump, goals, today), offline: true, secs: +((Date.now() - t0) / 1000).toFixed(1) };
  const docText = attachments.filter(a => a.text).map(a => `--- ${a.name} ---\n${a.text}`).join('\n\n');
  const images = attachments.filter(a => a.image).map(a => a.image);
  const prompt = `Today is ${DOW_LONG[dow(today)]}, ${today}. The user is a university student.
Their goals (id: name): ${goals.length ? goals.map(g => `${g.id}: ${g.name}`).join('; ') : 'none set'}.
Things already on their list (do not repeat these): ${existing.slice(0, 60).join(' | ') || 'nothing'}.

Read their brain dump and pull out:
- items: everything to DO (kind "task") and every fixed-time commitment (kind "event": meetings, classes, exams, interviews, appointments, conferences, travel).
- concerns: worries or feelings that are not tasks, rephrased gently in a few words.
- habits: recurring intentions like "gym 3 times a week" (name + per_week).

Rules:
- Resolve every date to YYYY-MM-DD relative to today. Numeric dates are day-first (12/11 = 12 November). "Friday" = the coming Friday; "next Friday" = Friday of next week. Use null when no date is implied. Never invent dates.
- Tasks: "due" = deadline date; "due_time" only if a clock time is stated. "hard_deadline" = true only for external deadlines that cannot slip (submissions, applications, registrations, payments, forms).
- Events: "date" (+ "time"/"end_time" if stated, "end_date" for multi-day like conferences). Events have effort_min 0.
- For every exam/test/quiz/viva/interview/presentation event, ALSO add a preparation task (e.g. "Revise for DSA exam") with due = the event date, realistic total effort, and "prep_for" = the event's exact title.
- effort_min = realistic TOTAL time for the whole task for a student (reply to email 5-10, call 15, problem set 180-300, essay/SOP 300-480, exam prep 360-900, read a paper 90). Small chores stay small; do not inflate.
- load: "light" (no thinking needed), "medium", or "deep" (needs full focus).
- goals: ids of goals the task genuinely advances, [] if none.
- Titles: short, start with a verb for tasks ("Submit SOP to MIT"); keep names of courses/people.
${docText ? `\nAttached material (use it to get deadlines and effort right):\n${docText.slice(0, 30000)}\n` : ''}
Reply ONLY with JSON: {"items":[{"title":"","kind":"task","hard_deadline":false,"due":null,"due_time":null,"date":null,"time":null,"end_time":null,"end_date":null,"effort_min":30,"load":"medium","goals":[],"prep_for":null}],"concerns":[],"habits":[{"name":"","per_week":3}]}

Brain dump:
${dump}`;
  try {
    const r = await llmJSON({ system: 'You turn messy student brain dumps into a calm, accurate plan.', prompt, schema: SCHEMA, images, maxTokens: 6000 });
    const ids = new Set(goals.map(g => g.id)), byName = Object.fromEntries(goals.map(g => [g.name.toLowerCase(), g.id]));
    const items = (r.items || []).filter(x => x && x.title).map(x => {
      const kind = x.kind === 'event' ? 'event' : 'task';
      const g = (x.goals || []).map(v => ids.has(v) ? v : byName[String(v).toLowerCase()]).filter(Boolean);
      const date = isISODate(x.date) ? x.date : isISODate(x.due) ? x.due : null;
      if (kind === 'event') return { tmp: uid('x'), title: x.title, kind, date, time: isTime(x.time) ? x.time : null, endTime: isTime(x.end_time) ? x.end_time : null, endDate: isISODate(x.end_date) ? x.end_date : null, goals: g, src: 'dump' };
      let due = isISODate(x.due) ? x.due : null; if (due && due < today) due = today;
      return { title: x.title, kind, due, dueTime: isTime(x.due_time) ? x.due_time : null, hard: !!x.hard_deadline && !!due, effort: Math.max(5, Math.min(3000, +x.effort_min || 30)), load: x.load, goals: g, prepForTitle: x.prep_for || null, src: 'dump' };
    });
    for (const it of items) if (it.prepForTitle) { const ev = items.find(e => e.kind === 'event' && e.title.toLowerCase() === String(it.prepForTitle).toLowerCase()); if (ev) it.prepForTmp = ev.tmp; delete it.prepForTitle; }
    return { items, concerns: (r.concerns || []).map(String).filter(Boolean), habits: (r.habits || []).filter(h => h?.name).map(h => ({ name: h.name, perWeek: Math.max(1, Math.min(7, +h.per_week || 3)) })), offline: false, secs: +((Date.now() - t0) / 1000).toFixed(1) };
  } catch (e) {
    return { ...offlineExtract(dump, goals, today), offline: true, error: e.message, secs: +((Date.now() - t0) / 1000).toFixed(1) };
  }
}

/** Turn extraction output into real items (resolving prep links) and drop duplicates of open items. */
export function toItems(ex, existingItems) {
  const open = new Set(existingItems.filter(i => i.status !== 'done').map(i => norm(i.title)));
  const tmpToId = {}, out = [];
  for (const x of ex.items) {
    if (open.has(norm(x.title))) continue;
    const it = makeItem(x); if (x.tmp) tmpToId[x.tmp] = it.id; it._prepForTmp = x.prepForTmp; out.push(it); open.add(norm(it.title));
  }
  for (const it of out) { if (it._prepForTmp) it.prepFor = tmpToId[it._prepForTmp] || null; delete it._prepForTmp; }
  return out;
}
export const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
