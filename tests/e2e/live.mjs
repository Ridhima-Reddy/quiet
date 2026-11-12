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
await sleep(1500); // the badge script loads async
await page.screenshot({ path: path.join(SHOTS, 'live-phone.png') });
// Netlify's badge (free plan) must not cover any of our controls
const overlaps = sel => page.evaluate(sel => {
  const ours = new Set([document.getElementById('root'), ...document.querySelectorAll('.toasts,canvas,script,style,link')]);
  const foreign = [...document.body.children, ...document.documentElement.children].filter(e => !ours.has(e) && e !== document.body && e !== document.head && getComputedStyle(e).display !== 'none');
  // the visible badge = the smallest foreign element whose text mentions Netlify
  const cands = foreign.flatMap(e => [e, ...(e.shadowRoot ? e.shadowRoot.querySelectorAll('*') : e.querySelectorAll('*'))]).filter(e => /netlify/i.test(e.textContent || '')).map(e => e.getBoundingClientRect()).filter(r => r.width > 20 && r.height > 15);
  const rects = cands.length ? [cands.reduce((a, b) => a.width * a.height <= b.width * b.height ? a : b)] : [];
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  return { badge: rects.length > 0, html: document.documentElement.className, covered: [...document.querySelectorAll(sel)].filter(el => { const r = el.getBoundingClientRect(); return rects.some(b => hit(r, b)); }).map(el => el.textContent.trim().slice(0, 20)) };
}, sel);
const o1 = await overlaps('.sheet .sf button');
(o1.badge ? ok : (n, c, x) => console.log('  • (not checked — badge not detectable from the page; see live-phone.png)', n))('hosting badge does not cover onboarding buttons', !o1.covered.length, `badge found: ${o1.badge} · ${o1.html} · covered: ${o1.covered.join(', ') || 'none'}`);
// skip onboarding, add a task offline-style, reload: data persists
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Skip')?.click()); await sleep(300);
const o2 = await overlaps('.tabbar button');
(o2.badge ? ok : (n, c, x) => console.log('  • (not checked — see live-phone-today.png)', n))('hosting badge does not cover the tab bar', !o2.covered.length, `covered: ${o2.covered.join(', ') || 'none'}`);
await page.screenshot({ path: path.join(SHOTS, 'live-phone-today.png') });
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
