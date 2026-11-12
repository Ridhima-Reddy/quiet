// Renders the app icons (PNG) from SVG using your installed Chrome, and creates the extension key
// (a stable extension ID, needed for the Google sign-in redirect URL).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import puppeteer from 'puppeteer-core';
import { mascotSVG } from '../src/ui/mascot.js';

const R = p => path.resolve(import.meta.dirname, '..', p);
const out = R('src/static/icons'); fs.mkdirSync(out, { recursive: true });

// --- extension key -> stable ID ---
if (!fs.existsSync(R('src/static/extension-key.txt'))) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const der = publicKey.export({ type: 'spki', format: 'der' });
  fs.mkdirSync(R('keys'), { recursive: true });
  fs.writeFileSync(R('keys/extension-key.pem'), privateKey.export({ type: 'pkcs8', format: 'pem' }));
  fs.writeFileSync(R('src/static/extension-key.txt'), der.toString('base64'));
}
const der = Buffer.from(fs.readFileSync(R('src/static/extension-key.txt'), 'utf8').trim(), 'base64');
const id = [...crypto.createHash('sha256').update(der).digest('hex').slice(0, 32)].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
fs.writeFileSync(R('src/static/extension-id.txt'), id + '\n');
console.log('Extension ID:', id, '\nRedirect URI for Google OAuth:', `https://${id}.chromiumapp.org/`);

// --- icons ---
const pet = mascotSVG('moss', { size: 100 }).replace(/<g class="q-zzz">[\s\S]*?<\/g>/, '').replace(/class="q-closed"/, 'class="q-closed" style="display:none"');
const icon = (size, { mask = false, tiny = false } = {}) => `<!doctype html><html><body style="margin:0;background:transparent">
<div style="width:${size}px;height:${size}px;border-radius:${mask ? 0 : size * 0.23}px;background:linear-gradient(160deg,#F4F7F2,#DCE8DF);display:grid;place-items:center;overflow:hidden">
${tiny ? `<div style="width:${size * 0.7}px;height:${size * 0.62}px;border-radius:50% 50% 46% 46%;background:radial-gradient(circle at 35% 30%,#E6F0E8,#6E9A7E 125%);margin-top:${size * 0.1}px"></div>`
    : `<div style="width:${size * (mask ? 0.62 : 0.84)}px;height:${size * (mask ? 0.62 : 0.84)}px;margin-top:${size * 0.02}px">${pet.replace(/width="100" height="100"/, 'width="100%" height="100%"')}</div>`}
</div></body></html>`;
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find(p => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage();
const sizes = [[16, { tiny: true }], [32, { tiny: true }], [48, {}], [128, {}], [180, {}], [192, {}], [512, {}]];
for (const [s, o] of sizes) {
  await page.setViewport({ width: s, height: s, deviceScaleFactor: 1 });
  await page.setContent(icon(s, o));
  await page.screenshot({ path: path.join(out, `icon-${s}.png`), omitBackground: true, clip: { x: 0, y: 0, width: s, height: s } });
}
await page.setViewport({ width: 512, height: 512 }); await page.setContent(icon(512, { mask: true }));
await page.screenshot({ path: path.join(out, 'maskable-512.png'), clip: { x: 0, y: 0, width: 512, height: 512 } });
await browser.close();
console.log('Icons written to', out);
