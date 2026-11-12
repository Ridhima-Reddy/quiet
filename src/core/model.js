// Quiet data model + defaults. Every synced record carries `u` (updated-at ms) and optional `del` (tombstone).
export const COLLECTIONS = ['items', 'sessions', 'goals', 'habits', 'habitLogs', 'checkins', 'focus', 'parked', 'notes', 'runs', 'prefs'];

export const uid = (p = '') => p + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);

export const emptyState = () => ({ v: 3, ...Object.fromEntries(COLLECTIONS.map(c => [c, {}])), gcal: { events: [], u: 0, calendars: [] } });

// Synced preferences (one record per key so devices merge per setting).
export const DEFAULT_PREFS = {
  name: '',
  focusHours: 4,            // how much task work you want on a normal day
  dayStart: '09:00',        // working window used for capacity + nudges
  dayEnd: '22:00',
  restDays: [],             // e.g. [0] = Sunday
  bedtime: '23:30',
  companion: 'moss',        // moss | cat | bunny | bear | owl | duck | none
  confetti: true,
  sound: true,
  theme: 'auto',            // auto | light | dark
  // nudges: interval in minutes (0 = off) or a time of day
  nudges: { water: 60, move: 75, eyes: 40, meals: true, lunch: '13:00', dinner: '20:00', winddown: true, quietStart: '23:45', quietEnd: '08:00', pauseInMeetings: true },
  // Google
  gcalPush: true,           // send events, hard deadlines and timed reminders to Google Calendar
  gcalPull: true,           // show Google Calendar events and count them as busy time
  gcalCalendarId: 'primary',
  gcalReadCalendars: ['primary'],
  gcalBlockFocus: false,    // also block focus time for big tasks (off: keeps your calendar clean)
  gcalBedtimeEvent: false,  // a daily wind-down event so your phone reminds you
  // AI
  aiProvider: 'quiet',      // quiet (shared, no key needed) | groq | gemini | openai | anthropic | none
  aiModel: '',
  studyMode: false,
  participant: '',
};

export const NUDGES = {
  water: { icon: 'droplet', title: 'Water', lines: ['A few sips of water?', 'Water break — your brain is mostly water, after all.', 'Quick sip, then back to it.'] },
  move: { icon: 'walk', title: 'Move', lines: ['Stand up and stretch for a minute.', 'Roll your shoulders, unclench your jaw.', 'A short walk resets everything.'] },
  eyes: { icon: 'eye', title: 'Eyes', lines: ['Look at something far away for 20 seconds.', 'Soft eyes — look out of a window for a moment.', 'Blink slowly a few times. Screens are a lot.'] },
  lunch: { icon: 'bowl', title: 'Lunch', lines: ['Lunch time. Step away from the screen and eat something real.', 'Have you eaten? Go get lunch — the work will wait.'] },
  dinner: { icon: 'bowl', title: 'Dinner', lines: ['Dinner time. Take a proper break.', 'Time to eat something warm.'] },
  winddown: { icon: 'moon', title: 'Wind down', lines: ['Bedtime is coming up. Start winding down?', 'Whatever is left will keep till tomorrow. Time to slow down.'] },
};

export const COMPANIONS = [
  { id: 'moss', name: 'Moss' }, { id: 'cat', name: 'Miso' }, { id: 'bunny', name: 'Hop' },
  { id: 'bear', name: 'Bun' }, { id: 'owl', name: 'Hoot' }, { id: 'duck', name: 'Dot' }, { id: 'none', name: 'No companion' },
];

export const LOADS = { light: 'Light', medium: 'Medium', deep: 'Deep focus' };

// Tasks below this many minutes are "just do it" items: never split, never chunked.
export const SMALL_TASK = 45;
// Tasks at or above this are split into sessions across several days.
export const SPLIT_TASK = 120;

/** Normalise an item to the current shape (used for anything coming from LLM, import or old data). */
export function makeItem(x = {}) {
  const now = Date.now(), kind = x.kind === 'event' ? 'event' : 'task';
  return {
    id: x.id || uid('i'), title: String(x.title || '').trim().slice(0, 140), kind,
    notes: x.notes || '',
    due: x.due || null, dueTime: x.dueTime || null, hard: !!x.hard,
    date: x.date || null, time: x.time || null, endTime: x.endTime || null, endDate: x.endDate || null, location: x.location || '',
    effort: kind === 'task' ? clamp(Math.round(+x.effort || 30), 5, 3000) : 0,
    load: ['light', 'medium', 'deep'].includes(x.load) ? x.load : guessLoad(+x.effort || 30),
    goals: Array.isArray(x.goals) ? x.goals : [],
    start: x.start || null,           // don't schedule before this date
    prepFor: x.prepFor || null,       // id of the event this task prepares for
    status: x.status === 'done' ? 'done' : 'open', doneAt: x.doneAt || null,
    steps: x.steps || null, attach: x.attach || [],
    cal: x.cal ?? null,               // null = automatic rule, true/false = user override for Google Calendar
    gcal: x.gcal || null,             // {id, calId, pushedU}
    src: x.src || 'manual', created: x.created || now, u: x.u || now,
  };
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const guessLoad = m => m <= 30 ? 'light' : m >= 120 ? 'deep' : 'medium';

/** What goes to Google Calendar (the rule shown to users):
 *  - events you have to show up for (meetings, classes, exams, interviews, conferences, appointments)
 *  - hard deadlines (submissions, applications, registrations, payments)
 *  - tasks pinned to a specific time ("call the bank at 4pm") so your phone reminds you
 *  Flexible work stays on the to-do list, so your calendar stays honest. */
export function calReason(it) {
  if (it.cal === false) return null;
  if (it.kind === 'event') return 'event';
  if (it.hard && it.due) return 'deadline';
  if (it.dueTime && it.due) return 'timed';
  if (it.cal === true && it.due) return 'manual';
  return null;
}
export const CAL_REASON_TEXT = {
  event: 'it is an event you need to show up for',
  deadline: 'it is a hard deadline',
  timed: 'it has a specific time, so your phone can remind you',
  manual: 'you asked for it',
};
