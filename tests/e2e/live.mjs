// Smoke-checks the hosted phone app: node tests/e2e/live.mjs [url]
import fs from 'node:fs'; import path from 'node:path'; import puppeteer from 'puppeteer-core';
const URL0 = process.argv[2] || 'https://quiet-calm-planner.netlify.app/';
const SHOTS = path.resolve(import.meta.dirname, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const res = []; const ok = (n, c, x = '') => { res.push(c); console.log(c ? '  ✔' : '  ✘', n, x); };
for (const f of ['', 'sw.js', 'manifest.webmanifest', 'icons/icon-192.png', 'vendor/pdf.worker.min.mjs']) {
  const r = await fetch(URL0 + f); ok(`GET /${f} → ${r.status}`, r.ok, `${r.headers.get('content-type')}${f === 'sw.js' ? ' · cache-control: ' + r.headers.get('cache-control') : ''}`);
}
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage(); const errors = [];
page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await page.goto(URL0 + '#/today', { waitUntil: 'load', timeout: 60000 }); await sleep(1200);
ok('app renders (onboarding for a new visitor)', !!(await page.$('[aria-label="Welcome to Quiet"]')));
const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!r; });
ok('offline service worker registered', sw);
const man = await page.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); const j = await (await fetch(l.href)).json(); return j.name + ' · ' + j.display + ' · ' + j.shortcuts.length + ' shortcuts'; });
ok('installable manifest', /standalone/.test(man), man);
await page.screenshot({ path: path.join(SHOTS, 'live-phone.png') });
// skip onboarding, add a task offline-style, reload: data persists
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Skip')?.click()); await sleep(300);
await page.tap('.tabbar .fab'); await sleep(300);
await page.type('.dump-area', 'call the bank tomorrow 4pm\nfinish lab report by friday');
await page.evaluate(() => [...document.querySelectorAll('.sheet .btn.primary')].find(b => /Sort it out/.test(b.textContent))?.click()); await sleep(1200);
ok('brain dump works on the live site', /sorted/.test(await page.$eval('.sheet', e => e.textContent)));
await page.reload({ waitUntil: 'load', timeout: 60000 }); await sleep(800);
const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('quiet3') || '{}').items || {});
ok('data survives a reload', Object.keys(kept).length >= 2, Object.keys(kept).length + ' items');
await browser.close();
ok('no errors on the live site', !errors.length, errors.slice(0, 3).join('\n'));
console.log(`${res.filter(Boolean).length}/${res.length} live checks passed`);
process.exit(res.every(Boolean) ? 0 : 1);
