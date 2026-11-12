// Quiet desktop app (Electron).
//  - Main window: the full Quiet app.
//  - Companion widget: a small always-on-top friend in the corner with your next task and nudges.
//  - Tray icon, Ctrl+Shift+Space for a brain dump from anywhere, optional launch at login.
//  - Google sign-in in your normal browser (PKCE + refresh token, stored encrypted on this device).
// The UI is served from a local server on 127.0.0.1 so Google and AI APIs see a normal web origin.
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, screen, globalShortcut, safeStorage, session } = require('electron');
const path = require('path'), fs = require('fs'), http = require('http'), crypto = require('crypto');

const APP_DIR = path.join(__dirname, 'app');
const PORTS = [47821, 47822, 47823, 47824];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };
const SIZES = { pet: [140, 140], bubble: [420, 240], panel: [390, 600] };
let origin = '', main = null, widget = null, tray = null, quitting = false;
const userFile = n => path.join(app.getPath('userData'), n);
const settings = (() => { try { return JSON.parse(fs.readFileSync(userFile('settings.json'), 'utf8')); } catch { return { widget: true }; } })();
const saveSettings = () => { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(userFile('settings.json'), JSON.stringify(settings)); };
const config = (() => { for (const f of [userFile('config.json'), path.join(__dirname, 'config.json'), path.join(__dirname, 'config.example.json')]) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch {} } return {}; })();
const icon = nativeImage.createFromPath(path.join(APP_DIR, 'icons', 'icon-512.png'));

function serve() {
  const handler = (req, res) => {
    let f = path.join(APP_DIR, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(APP_DIR)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(f).pipe(res);
  };
  // The port is part of the web origin, and the origin owns this device's local data — so once a port
  // is chosen it is remembered and retried (for a while) rather than silently switching origins.
  const listen = port => new Promise(res => { const s = http.createServer(handler); s.once('error', () => res(false)); s.listen(port, '127.0.0.1', () => res(true)); });
  return (async () => {
    if (settings.port) {
      for (let i = 0; i < 30; i++) { if (await listen(settings.port)) return `http://127.0.0.1:${settings.port}`; await new Promise(r => setTimeout(r, 500)); }
      const { dialog } = require('electron');
      dialog.showErrorBox('Quiet', `Port ${settings.port} is in use by another program, so Quiet can't open this device's saved data. Close that program and start Quiet again.`);
      app.exit(1);
    }
    for (const p of PORTS) if (await listen(p)) { settings.port = p; saveSettings(); return `http://127.0.0.1:${p}`; }
    throw new Error('No free port for Quiet');
  })();
}

const webPreferences = { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false };

function createMain(hash = '#/today') {
  main = new BrowserWindow({ width: 1300, height: 860, minWidth: 380, minHeight: 560, title: 'Quiet', icon, backgroundColor: '#F6F5F1', show: false, autoHideMenuBar: true, webPreferences });
  main.loadURL(origin + '/index.html' + hash);
  main.once('ready-to-show', () => { if (!process.argv.includes('--hidden')) main.show(); });
  main.on('close', e => { if (!quitting) { e.preventDefault(); main.hide(); } });
  main.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}
function showMain(hash) {
  if (!main || main.isDestroyed()) return createMain(hash);
  if (hash) main.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`).catch(() => {});
  if (main.isMinimized()) main.restore();
  main.show(); main.focus();
}

function createWidget() {
  const wa = screen.getPrimaryDisplay().workArea, [w, h] = SIZES.pet;
  const pos = settings.widgetPos || { x: wa.x + wa.width - w - 12, y: wa.y + wa.height - h - 4 };
  widget = new BrowserWindow({ width: w, height: h, x: pos.x, y: pos.y, frame: false, transparent: true, resizable: false, maximizable: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: false, show: false, title: 'Quiet companion', webPreferences });
  widget.setAlwaysOnTop(true, 'floating');
  widget.loadURL(origin + '/widget.html');
  widget.once('ready-to-show', () => widget.showInactive());
  widget.on('moved', () => { const b = widget.getBounds(); settings.widgetPos = { x: b.x + b.width - SIZES.pet[0], y: b.y + b.height - SIZES.pet[1] }; saveSettings(); });
  widget.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}
function toggleWidget(on) {
  settings.widget = on; saveSettings();
  if (on && (!widget || widget.isDestroyed())) createWidget();
  if (!on && widget && !widget.isDestroyed()) { widget.destroy(); widget = null; }
  buildTray();
}

function buildTray() {
  const menu = Menu.buildFromTemplate([
    { label: 'Open Quiet', click: () => showMain('#/today') },
    { label: 'Brain dump', accelerator: 'CommandOrControl+Shift+Space', click: () => showMain('#/dump') },
    { label: 'Start focus', click: () => showMain('#/focus') },
    { type: 'separator' },
    { label: 'Show companion on screen', type: 'checkbox', checked: !!settings.widget, click: i => toggleWidget(i.checked) },
    { label: 'Open Quiet when I log in', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: i => app.setLoginItemSettings({ openAtLogin: i.checked, args: ['--hidden'] }) },
    { type: 'separator' },
    { label: 'Quit Quiet', click: () => { quitting = true; app.quit(); } },
  ]);
  if (!tray) { tray = new Tray(icon.resize({ width: 16, height: 16 })); tray.setToolTip('Quiet'); tray.on('click', () => showMain()); }
  tray.setContextMenu(menu);
}

// ---------- Google sign-in (Desktop OAuth client, PKCE, loopback redirect) ----------
const TOKENS = () => userFile('google.bin');
const b64u = b => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function readTokens() { try { const raw = fs.readFileSync(TOKENS()); return JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString()); } catch { return null; } }
function writeTokens(t) { const s = JSON.stringify(t); fs.writeFileSync(TOKENS(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(s) : s); }
async function tokenRequest(params) {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.googleClientId, client_secret: config.googleClientSecret || '', ...params }) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error_description || j.error || 'Google sign-in failed'); return j;
}
async function googleToken({ interactive, scopes, force }) {
  if (!config.googleClientId) { if (interactive) throw new Error('Desktop Google sign-in is not set up — add googleClientId/googleClientSecret to desktop/config.json (see Desktop › Quiet docs › GOOGLE_SETUP.md).'); return null; }
  const saved = readTokens();
  if (!force && saved?.access && saved.exp > Date.now() + 90e3) return { token: saved.access, exp: saved.exp };
  if (saved?.refresh) {
    try { const j = await tokenRequest({ grant_type: 'refresh_token', refresh_token: saved.refresh }); const t = { ...saved, access: j.access_token, exp: Date.now() + j.expires_in * 1000 }; writeTokens(t); return { token: t.access, exp: t.exp }; }
    catch (e) { if (!interactive) return null; }
  }
  if (!interactive) return null;
  const verifier = b64u(crypto.randomBytes(32)), challenge = b64u(crypto.createHash('sha256').update(verifier).digest()), state = b64u(crypto.randomBytes(16));
  const { code, redirect } = await new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (!u.searchParams.has('code') && !u.searchParams.has('error')) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset="utf-8"><title>Quiet</title><body style="font:16px system-ui;background:#F6F5F1;color:#1E1E1B;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h2 style="font-family:Georgia,serif;font-weight:400">${u.searchParams.get('error') ? 'Sign-in was cancelled.' : 'You\'re connected.'}</h2><p>You can close this tab and go back to Quiet.</p></div>`);
      srv.close(); clearTimeout(to);
      if (u.searchParams.get('state') !== state) return reject(new Error('Sign-in failed (state mismatch)'));
      if (u.searchParams.get('error')) return reject(new Error('Sign-in was cancelled'));
      resolve({ code: u.searchParams.get('code'), redirect: `http://127.0.0.1:${srv.address()?.port || port}` });
    });
    let port = 0;
    const to = setTimeout(() => { srv.close(); reject(new Error('Sign-in timed out')); }, 5 * 60e3);
    srv.listen(0, '127.0.0.1', () => {
      port = srv.address().port;
      const q = new URLSearchParams({ client_id: config.googleClientId, redirect_uri: `http://127.0.0.1:${port}`, response_type: 'code', scope: scopes, code_challenge: challenge, code_challenge_method: 'S256', state, access_type: 'offline', prompt: 'consent select_account' });
      shell.openExternal('https://accounts.google.com/o/oauth2/v2/auth?' + q);
    });
  });
  const j = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier });
  const t = { access: j.access_token, exp: Date.now() + j.expires_in * 1000, refresh: j.refresh_token || saved?.refresh };
  writeTokens(t);
  if (main && !main.isDestroyed()) { main.show(); main.focus(); }
  return { token: t.access, exp: t.exp };
}
async function googleSignOut() { const t = readTokens(); try { fs.unlinkSync(TOKENS()); } catch {} if (t?.refresh) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t.refresh), { method: 'POST' }).catch(() => {}); }

// ---------- IPC ----------
ipcMain.handle('google-token', (_e, o) => googleToken(o || {}));
ipcMain.handle('google-signout', () => googleSignOut());
ipcMain.handle('login-item', (_e, on) => { app.setLoginItemSettings({ openAtLogin: !!on, args: ['--hidden'] }); buildTray(); return !!on; });
ipcMain.on('open-main', (_e, hash) => showMain(hash));
ipcMain.on('widget-size', (_e, mode) => {
  if (!widget || widget.isDestroyed() || !SIZES[mode]) return;
  const b = widget.getBounds(), [w, h] = SIZES[mode];
  widget.setBounds({ x: b.x + b.width - w, y: b.y + b.height - h, width: w, height: h });
  if (mode === 'panel') widget.focus();
});

// ---------- app lifecycle ----------
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => showMain());
  app.whenReady().then(async () => {
    origin = await serve();
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(['media', 'notifications', 'clipboard-sanitized-write'].includes(perm)));
    createMain();
    if (settings.widget !== false) createWidget();
    buildTray();
    globalShortcut.register('CommandOrControl+Shift+Space', () => showMain('#/dump'));
    if (process.argv.includes('--smoke')) setTimeout(async () => {
      const img = await main.webContents.capturePage(); fs.writeFileSync(path.join(__dirname, 'smoke-main.png'), img.toPNG());
      if (widget) { const w = await widget.webContents.capturePage(); fs.writeFileSync(path.join(__dirname, 'smoke-widget.png'), w.toPNG()); }
      console.log('SMOKE OK', origin); quitting = true; app.quit();
    }, 6000);
  });
  app.on('window-all-closed', () => { /* keep running in the tray */ });
  app.on('before-quit', () => { quitting = true; });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('activate', () => showMain());
}
