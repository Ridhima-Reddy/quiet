// End-to-end check of the web build in real Chrome: node tests/e2e/run.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import puppeteer from 'puppeteer-core';
import { makeItem, emptyState } from '../../src/core/model.js';
import { addDays, todayISO } from '../../src/core/dates.js';

const R = p => path.resolve(import.meta.dirname, '../..', p);
const SHOTS = R('tests/e2e/shots'); fs.mkdirSync(SHOTS, { recursive: true });
const dir = R('dist/web'), PORT = 5179;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((q, s) => { let f = path.join(dir, new URL(q.url, 'http://x').pathname); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html'); if (!fs.existsSync(f)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(s); }).listen(PORT);
const URL0 = `http://localhost:${PORT}/`;
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-first-run', '--disable-gpu'] });
const errors = [], results = [];
const ok = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); console.log(cond ? '  ✔' : '  ✘', name, extra); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function newPage(vp = { width: 1366, height: 900 }) {
  const page = await browser.newPage();
  await page.setViewport(vp);
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  return page;
}
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false });
const text = (page, sel) => page.$$eval(sel, els => els.map(e => e.textContent.trim()));
const clickText = async (page, sel, t) => { const h = await page.evaluateHandle((s, t) => [...document.querySelectorAll(s)].find(e => e.textContent.includes(t)), sel, t); const el = h.asElement(); if (!el) throw new Error(`no ${sel} with "${t}"`); await el.click(); };
async function drag(page, from, to) {
  const a = await from.boundingBox(), b = await to.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + 10); await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(a.x + a.width / 2 + (b.x + b.width / 2 - a.x - a.width / 2) * i / 12, a.y + 10 + (b.y + 40 - a.y - 10) * i / 12); await sleep(16); }
  await page.mouse.up(); await sleep(400);
}

// ---------- A. A new user, through the UI ----------
console.log('A. New user');
let page = await newPage();
await page.goto(URL0 + '#/today'); await sleep(800);
ok('onboarding shows for a new user', !!(await page.$('[aria-label="Welcome to Quiet"]')));
await shot(page, 'a1-onboarding');
await page.type('[aria-label="Welcome to Quiet"] input', 'Asha');
await clickText(page, 'button', 'Next'); await sleep(200);
await clickText(page, '.seg button', 'Become a better researcher'); await clickText(page, '.seg button', 'Sleep well');
await clickText(page, 'button', 'Next'); await sleep(200);
await clickText(page, 'button', 'Maybe later'); await sleep(500);
ok('onboarding leads straight to the brain dump', !!(await page.$('.dump-area')));
const T = todayISO();
await page.type('.dump-area', `DSA midsem next friday at 10am
submit SOP for ETH by ${addDays(T, 9).split('-').reverse().slice(0, 2).join('/')}
reply to Prof Rao's email
call mom tomorrow 6pm
read the transformer paper
pay hostel fees by friday
I'm worried I'm falling behind on research
gym 3 times a week`);
await shot(page, 'a2-dump');
await clickText(page, 'button', 'Sort it out'); await sleep(1200);
const resText = await page.$eval('.sheet', e => e.textContent);
ok('brain dump sorted (offline sorter)', /sorted/.test(resText), resText.slice(0, 80));
ok('exam went to the calendar group', /On your calendar/.test(resText) && /DSA midsem/i.test(resText));
ok('worry was parked, not made a task', /Parked for now/.test(resText));
ok('habit suggestion offered', /Sounds like a habit/.test(resText));
await shot(page, 'a3-dump-result');
await clickText(page, 'button', 'Looks good'); await sleep(600);
await shot(page, 'a4-today');
const todayRows = await text(page, '.item .t');
ok('Today lists tasks', todayRows.length > 0, todayRows.join(' | '));
ok('15-minute reply has no "break it down" in Start here', !(await page.$eval('.start', e => /Reply/i.test(e.textContent) && /Break it down/.test(e.textContent)).catch(() => false)));
// tick the first task on today
const before = (await text(page, '.item:not(.done) .t')).length;
await page.click('.item .check'); await sleep(250);
ok('confetti canvas appears', !!(await page.$('canvas[aria-hidden="true"]')));
ok('a "good job" toast with Undo appears', !!(await page.$('.toast button')), (await text(page, '.toast')).join(' '));
await shot(page, 'a5-checked');
await sleep(1300);
const after = (await text(page, '.item:not(.done) .t')).length;
ok('checked task leaves the to-do list', after === before - 1, `${before} -> ${after}`);
// energy
if (await page.$('.energy')) { await clickText(page, '.energy button', 'Low'); await sleep(300); ok('energy check-in recorded', !(await page.$('.energy'))); }
else console.log('  • energy check-in is hidden late at night (by design) — skipped');

// Plan: drag + tick on a future day
await page.goto(URL0 + '#/plan'); await sleep(700);
await shot(page, 'a6-plan-week');
const cols = await page.$$('.week .daycol');
let moved = false, futureTicked = false;
const card = await page.$('.week .daycol:not(.past) .mini:not(.done)[data-drag^="s:"]');
if (card) {
  const srcDay = await card.evaluate(e => e.closest('.daycol').getAttribute('data-drop'));
  const target = (await Promise.all(cols.map(async c => [c, await c.evaluate(e => e.getAttribute('data-drop'))]))).find(([c, d]) => d > 'day:' + T && d !== srcDay)?.[0];
  const title = await card.$eval('.t', e => e.textContent);
  await drag(page, card, target); await sleep(300);
  const toastT = (await text(page, '.toast')).join(' ');
  const tgtTitles = await target.$$eval('.mini .t', es => es.map(e => e.textContent));
  moved = tgtTitles.includes(title);
  ok('drag a task to another day (mouse)', moved, `${title} ${toastT}`);
}
const fut = await page.$$('.week .daycol:not(.past):not(.today) .mini:not(.done) .check');
if (fut.length) { await fut[0].click(); await sleep(500); futureTicked = (await page.$$('.week .daycol:not(.today) .mini.done')).length > 0; }
ok('tick a task that is not on today', futureTicked);
await shot(page, 'a7-plan-after');
await clickText(page, '.pill-toggle button', 'Month'); await sleep(400);
await shot(page, 'a8-month');

// Tasks board
await page.goto(URL0 + '#/tasks'); await sleep(600);
await shot(page, 'a9-board');
const bcard = await page.$('.bcol[data-drop="bucket:anytime"] .bcard') || await page.$('.bcol .bcard');
const tom = await page.$('.bcol[data-drop="bucket:tomorrow"]');
if (bcard && tom) {
  const title = await bcard.$eval('.t', e => e.textContent);
  await drag(page, bcard, tom); await sleep(400);
  const tt = await page.$$eval('.bcol[data-drop="bucket:tomorrow"] .bcard .t', es => es.map(e => e.textContent));
  ok('board: drag a card into Tomorrow', tt.includes(title), title);
}
const anyCheck = await page.$('.bcol .bcard .check');
if (anyCheck) { const n0 = (await page.$$('.bcol .bcard')).length; await anyCheck.click(); await sleep(1500); const n1 = (await page.$$('.bcol .bcard')).length; ok('board: tick any task off', n1 === n0 - 1, `${n0}->${n1}`); }

// Item detail + chunk rules
await page.goto(URL0 + '#/tasks'); await sleep(400);
await clickText(page, '.bcard .t', 'SOP'); await sleep(400);
ok('big task offers "Break it into steps"', /Break it into steps/.test(await page.$eval('.sheet', e => e.textContent)));
ok('hard deadline goes to Google Calendar', /hard deadline/.test(await page.$eval('.sheet', e => e.textContent)));
await clickText(page, 'button', 'Break it into steps'); await sleep(500);
ok('steps appear (offline coach)', /Chunk 1 of/.test(await page.$eval('.sheet', e => e.textContent)));
await shot(page, 'a10-detail-big');
await page.keyboard.press('Escape'); await sleep(200);
const small = await page.evaluateHandle(() => [...document.querySelectorAll('.bcard .t')].find(e => /reply|call|pay/i.test(e.textContent)));
if (small.asElement()) { await small.asElement().click(); await sleep(400); const st = await page.$eval('.sheet', e => e.textContent); ok('small task is NOT chunked', !/Break it into steps/.test(st) && /Small task/.test(st)); await shot(page, 'a11-detail-small'); await page.keyboard.press('Escape'); }

// Week + You + Focus
await page.goto(URL0 + '#/week'); await sleep(500); await shot(page, 'a12-week');
await page.goto(URL0 + '#/you'); await sleep(500); await shot(page, 'a13-you');
await page.goto(URL0 + '#/today'); await sleep(400);
await page.keyboard.press('f'); await sleep(300);
await clickText(page, 'button', 'Start focus'); await sleep(1300);
ok('focus timer runs', /\d\d:\d\d/.test(await page.$eval('.focus .tm', e => e.textContent)));
await shot(page, 'a14-focus');
await page.close();

// ---------- B. Seeded: a heavy week, phone layout, dark mode ----------
console.log('B. Heavy week');
const s = emptyState(), now = Date.now(), put = (c, r) => { s[c][r.id] = { ...r, u: now }; };
put('prefs', { id: 'name', v: 'Asha' }); put('prefs', { id: 'companion', v: 'cat' });
['Become a better researcher', 'Stay physically healthy', 'Keep in touch with family'].forEach((n, i) => put('goals', { id: 'g' + i, name: n, order: i }));
put('habits', { id: 'h1', name: 'Gym', perWeek: 3 }); put('habits', { id: 'h2', name: 'Read', perWeek: 5 });
for (let k = 1; k <= 5; k++) {
  const d = addDays(T, -k), it = makeItem({ title: `Lab report ${k}`, effort: 240, due: d, goals: ['g0'], status: 'done', doneAt: new Date(d + 'T21:00').getTime() });
  put('items', it); put('sessions', { id: `${it.id}@${d}`, itemId: it.id, date: d, minutes: 240, done: true, doneAt: new Date(d + 'T21:00').getTime() });
  const it2 = makeItem({ title: `Problem set ${k}`, effort: 180, due: d, status: 'done', doneAt: new Date(d + 'T23:50').getTime() });
  put('items', it2); put('sessions', { id: `${it2.id}@${d}`, itemId: it2.id, date: d, minutes: 180, done: true, doneAt: new Date(d + 'T23:50').getTime() });
  put('checkins', { id: d, date: d, energy: [2, 1, 2, 3, 1][k - 1], feel: 'heavy' });
  if (k % 2) put('habitLogs', { id: `h1@${d}`, habitId: 'h1', date: d });
}
const add = x => { const it = makeItem(x); put('items', it); return it; };
add({ title: 'Write related-work section', effort: 300, load: 'deep', due: addDays(T, 6), hard: true, goals: ['g0'] });
add({ title: 'Email Prof. Rao about the dataset', effort: 10, due: addDays(T, 1) });
add({ title: 'Book train tickets home', effort: 15, due: addDays(T, 3), goals: ['g2'] });
add({ title: 'Revise for ML midsem', effort: 480, load: 'deep', due: addDays(T, 8) });
add({ title: 'Read "Atomic Habits"', effort: 60, goals: ['g1'] });
add({ title: 'ML midsem', kind: 'event', date: addDays(T, 8), time: '10:00', endTime: '13:00' });
s.gcal = { u: now, events: [{ id: 'g1', calId: 'primary', title: 'Lab group meeting', date: T, time: '15:00', endTime: '16:00' }, { id: 'g2', calId: 'primary', title: 'Advisor 1:1', date: addDays(T, 1), time: '11:30', endTime: '12:00' }] };
const local = { deviceId: 'dtest', onboarded: true, lastNudge: { any: now, brief: T }, dismissed: {}, ui: {} };
for (const [name, vp, dark] of [['b1-desktop', { width: 1440, height: 920 }, false], ['b2-dark', { width: 1440, height: 920 }, true], ['b3-phone', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, false]]) {
  page = await newPage(vp);
  if (dark) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.evaluateOnNewDocument((st, lo) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('quiet3', JSON.stringify(st)); localStorage.setItem('quiet3local', JSON.stringify(lo)); } }, s, local);
  await page.goto(URL0 + '#/today'); await sleep(900);
  if (name === 'b1-desktop') {
    const cards = await text(page, '.acard h4');
    ok('heavy stretch is recognised', cards.some(c => /heavy|carrying|full days/i.test(c)), cards.join(' | '));
    ok('late nights are noticed', cards.some(c => /late nights/i.test(c)));
    ok('Google Calendar meeting shows in today\'s schedule', /Lab group meeting/.test(await page.$eval('.today-grid', e => e.textContent)));
    await shot(page, name);
    const bodies = (await text(page, '.acard p')).join(' | ');
    // The heavy-week card offers "Lighten tomorrow" only when tomorrow is >60% full (depends on the clock).
    const lightBtn = await page.evaluateHandle(() => [...document.querySelectorAll('.acard button')].find(b => /Lighten tomorrow/.test(b.textContent))).then(h => h.asElement());
    if (lightBtn) await lightBtn.click(); else { await page.goto(URL0 + '#/plan'); await sleep(500); await clickText(page, 'button', 'Lighten a day'); await sleep(300); await clickText(page, '.sheet .seg button', 'Tomorrow'); }
    await sleep(500);
    await shot(page, 'b1b-lighten');
    const sheetText = await page.$eval('.sheet', e => e.textContent);
    ok('lighten sheet opens with a sensible proposal', /can wait|already light|can safely move/.test(sheetText), lightBtn ? 'from heavy-week card' : `tomorrow already light — card said: ${bodies.slice(0, 120)}`);
    await page.keyboard.press('Escape');
    await page.goto(URL0 + '#/week'); await sleep(600); await shot(page, 'b1c-week');
    await page.goto(URL0 + '#/plan'); await sleep(600); await shot(page, 'b1d-plan');
  } else if (name === 'b3-phone') {
    await shot(page, 'b3-phone-today');
    await page.goto(URL0 + '#/plan'); await sleep(600); await shot(page, 'b3-phone-plan');
    // touch long-press drag onto a day chip
    const row = await page.$('.mobile-day .mini[data-drag^="s:"]');
    const chips = await page.$$('.daystrip button');
    if (row && chips.length) {
      const a = await row.boundingBox(), b = await chips[chips.length - 1].boundingBox();
      const cdp = await page.createCDPSession();
      const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      await tp('touchStart', a.x + 140, a.y + 14); await sleep(400);
      for (let i = 1; i <= 10; i++) { await tp('touchMove', a.x + 140 + (b.x + b.width / 2 - a.x - 140) * i / 10, a.y + 14 + (b.y + b.height / 2 - a.y - 14) * i / 10); await sleep(20); }
      await tp('touchEnd'); await sleep(500);
      ok('phone: long-press drag a task onto another day', /Moved to/.test((await text(page, '.toast')).join(' ')), (await text(page, '.toast')).join(' '));
    }
    await page.goto(URL0 + '#/tasks'); await sleep(500); await shot(page, 'b3-phone-tasks');
    await page.goto(URL0 + '#/today'); await sleep(300); await page.tap('.tabbar .fab'); await sleep(400); await shot(page, 'b3-phone-dump');
  } else await shot(page, name);
  await page.close();
}

await browser.close(); server.close();
const real = errors.filter(e => !/favicon|ERR_FILE_NOT_FOUND|404/.test(e));
ok('no console errors', real.length === 0, real.slice(0, 5).join('\n'));
const failed = results.filter(r => r[0] === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots: ${SHOTS}`);
process.exit(failed.length ? 1 : 0);
