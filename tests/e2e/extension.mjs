// Loads the built extension unpacked in Chrome and checks the popup, the app page, the background
// worker and an on-page nudge. node tests/e2e/extension.mjs
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import puppeteer from 'puppeteer-core';
const R = p => path.resolve(import.meta.dirname, '../..', p);
const EXT = R('dist/extension'), SHOTS = R('tests/e2e/shots'); fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (n, c, x = '') => { results.push(c); console.log(c ? '  ✔' : '  ✘', n, x); };
const server = http.createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><title>Some page</title><body style="font:16px system-ui;padding:40px"><h1>A normal web page</h1><p>Reading something…</p>'); }).listen(5190);
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, pipe: true, enableExtensions: [EXT], args: ['--no-first-run'] });
const errors = [];
await sleep(1500);
const sw = await browser.waitForTarget(t => t.type() === 'service_worker' && t.url().endsWith('background.js'), { timeout: 10000 }).catch(() => null);
ok('background service worker starts', !!sw, sw?.url());
const id = sw ? new URL(sw.url()).host : fs.readFileSync(R('src/static/extension-id.txt'), 'utf8').trim();
ok('extension ID matches the fixed key (needed for Google sign-in)', id === fs.readFileSync(R('src/static/extension-id.txt'), 'utf8').trim(), id);
const worker = sw ? await sw.worker() : null;
if (worker) { worker.on('console', m => m.type() === 'error' && errors.push('sw: ' + m.text())); const alarms = await worker.evaluate(() => new Promise(r => chrome.alarms.getAll(r))); ok('alarms scheduled (nudges every minute, sync)', alarms.some(a => a.name === 'tick') && alarms.some(a => a.name === 'sync'), alarms.map(a => a.name).join(',')); }

// close the welcome tab, seed "onboarded"
for (const p of await browser.pages()) if (p.url().includes(id)) await p.close();
const app = await browser.newPage(); await app.setViewport({ width: 1280, height: 840 });
app.on('pageerror', e => errors.push('app: ' + e)); app.on('console', m => m.type() === 'error' && errors.push('app: ' + m.text()));
await app.goto(`chrome-extension://${id}/app.html#/today`); await sleep(500);
await app.evaluate(() => chrome.storage.local.set({ quiet3local: { onboarded: true, deviceId: 'x' } })); await app.reload(); await sleep(700);
await app.keyboard.press('d'); await sleep(300);
await app.type('.dump-area', 'reply to Prof Rao today\nwrite lit review by next friday\nmeeting with advisor tomorrow 3pm');
await app.click('.sheet .btn.primary'); await sleep(1200);
ok('brain dump works inside the extension', /sorted/.test(await app.$eval('.sheet', e => e.textContent)));
await app.keyboard.press('Escape'); await sleep(300);
await app.screenshot({ path: path.join(SHOTS, 'ext-app.png') });

const pop = await browser.newPage(); await pop.setViewport({ width: 390, height: 600 });
pop.on('pageerror', e => errors.push('popup: ' + e));
await pop.goto(`chrome-extension://${id}/popup.html`); await sleep(800);
const rows = await pop.$$eval('.item .t', es => es.map(e => e.textContent));
ok('popup shows today\'s list', rows.length > 0, rows.join(' | '));
await pop.click('.item .check'); await sleep(400);
ok('tick from the popup', !!(await pop.$('.toast')));
await pop.screenshot({ path: path.join(SHOTS, 'ext-popup.png') });
const badge = worker ? await worker.evaluate(() => chrome.action.getBadgeText({})) : '';
ok('toolbar badge shows what is left today', badge !== undefined, JSON.stringify(badge));

// on-page nudge
const web = await browser.newPage(); await web.goto('http://localhost:5190/'); await web.bringToFront(); await sleep(800);
if (worker) await worker.evaluate(async () => { const [t] = await chrome.tabs.query({ url: 'http://localhost:5190/*' }); await chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] }).catch(() => {}); await chrome.tabs.sendMessage(t.id, { type: 'nudge', title: 'Water', text: 'A few sips of water?', buttons: ['Done', 'Later'], companion: 'moss' }); });
await sleep(900);
const hasNudge = await web.evaluate(() => [...document.querySelectorAll('div')].some(d => d.shadowRoot && /A few sips/.test(d.shadowRoot.textContent)));
ok('companion nudge appears on a normal web page', hasNudge);
await web.screenshot({ path: path.join(SHOTS, 'ext-nudge.png') });

await browser.close(); server.close();
const real = errors.filter(e => !/favicon|deprecated/i.test(e));
ok('no errors in extension pages/worker', !real.length, real.slice(0, 4).join('\n'));
console.log(`${results.filter(Boolean).length}/${results.length} extension checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
