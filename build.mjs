// One codebase -> three apps:
//   dist/extension  Chrome extension (load unpacked, or zip for the Web Store)
//   dist/web        Phone / web app (installable PWA; host on any static HTTPS host)
//   desktop/app     Desktop app files (run with: cd desktop && npm start)
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const watch = process.argv.includes('--watch');
const R = p => path.resolve(import.meta.dirname, p);
const VERSION = JSON.parse(fs.readFileSync(R('package.json'))).version;
const STAMP = Date.now().toString(36);
const rm = d => fs.rmSync(d, { recursive: true, force: true });
const mk = d => fs.mkdirSync(d, { recursive: true });
const cp = (a, b) => { mk(path.dirname(b)); fs.cpSync(a, b, { recursive: true }); };
const write = (f, s) => { mk(path.dirname(f)); fs.writeFileSync(f, s); };

const common = { bundle: true, jsx: 'automatic', jsxImportSource: 'preact', target: ['chrome110', 'safari16', 'firefox115'], minify: !watch, sourcemap: watch ? 'inline' : false, legalComments: 'none', logLevel: 'warning', define: { 'process.env.NODE_ENV': '"production"' } };

const page = (title, script, { web = false, desktop = false } = {}) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="Quiet — a calm companion that turns your brain dump into a realistic plan and looks after your wellbeing.">
<meta name="theme-color" content="#F6F5F1" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#121211" media="(prefers-color-scheme: dark)">
${web ? '<link rel="manifest" href="manifest.webmanifest"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Quiet"><meta name="apple-mobile-web-app-status-bar-style" content="default"><link rel="apple-touch-icon" href="icons/icon-180.png">' : ''}
<link rel="icon" href="icons/icon-32.png"><link rel="stylesheet" href="styles.css?v=${STAMP}">
</head><body${desktop ? ' class="desktop"' : ''}><div id="root"></div><script type="module" src="${script}?v=${STAMP}"></script></body></html>`;

async function build() {
  const t0 = Date.now();
  const tmp = R('dist/_pages'); rm(tmp);
  // Pages share chunks (Preact, core, UI) via ESM code splitting.
  await esbuild.build({ ...common, entryPoints: { app: R('src/entries/app.jsx'), popup: R('src/entries/popup.jsx'), widget: R('src/entries/widget.jsx') }, outdir: tmp, format: 'esm', splitting: true, chunkNames: 'chunks/[name]-[hash]' });
  // Extension worker + content script: self-contained (no remote code, no dynamic imports).
  await esbuild.build({ ...common, entryPoints: [R('src/entries/background.js')], outfile: R('dist/_bg/background.js'), format: 'esm', external: ['@anthropic-ai/sdk', 'fflate'] });
  await esbuild.build({ ...common, entryPoints: [R('src/entries/content.js')], outfile: R('dist/_bg/content.js'), format: 'iife' });

  const shared = dir => {
    cp(R('src/ui/styles.css'), path.join(dir, 'styles.css'));
    cp(path.join(tmp, 'chunks'), path.join(dir, 'chunks'));
    cp(R('node_modules/pdfjs-dist/build/pdf.min.mjs'), path.join(dir, 'vendor/pdf.min.mjs'));
    cp(R('node_modules/pdfjs-dist/build/pdf.worker.min.mjs'), path.join(dir, 'vendor/pdf.worker.min.mjs'));
    if (fs.existsSync(R('src/static/icons'))) cp(R('src/static/icons'), path.join(dir, 'icons'));
  };

  // ---- Chrome extension ----
  const ext = R('dist/extension'); rm(ext); shared(ext);
  ['app.js', 'popup.js'].forEach(f => cp(path.join(tmp, f), path.join(ext, f)));
  cp(R('dist/_bg/background.js'), path.join(ext, 'background.js')); cp(R('dist/_bg/content.js'), path.join(ext, 'content.js'));
  write(path.join(ext, 'app.html'), page('Quiet', 'app.js'));
  write(path.join(ext, 'popup.html'), page('Quiet', 'popup.js'));
  const key = fs.existsSync(R('src/static/extension-key.txt')) ? fs.readFileSync(R('src/static/extension-key.txt'), 'utf8').trim() : null;
  const icons = { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' };
  write(path.join(ext, 'manifest.json'), JSON.stringify({
    manifest_version: 3, name: 'Quiet', version: VERSION,
    description: 'A calm companion: turn your brain dump into a realistic plan, sync with Google Calendar, and get gentle nudges to eat, move and rest.',
    ...(key ? { key } : {}),
    permissions: ['storage', 'unlimitedStorage', 'alarms', 'tabs', 'scripting', 'identity', 'notifications'],
    host_permissions: ['<all_urls>'],
    background: { service_worker: 'background.js', type: 'module' },
    action: { default_popup: 'popup.html', default_title: 'Quiet', default_icon: icons },
    icons,
    content_scripts: [{ matches: ['http://*/*', 'https://*/*'], js: ['content.js'], run_at: 'document_idle' }],
    commands: { _execute_action: { suggested_key: { default: 'Ctrl+Shift+Q', mac: 'Command+Shift+Q' }, description: 'Open Quiet' } },
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
  }, null, 2));

  // ---- Web / phone (PWA) ----
  const web = R('dist/web'); rm(web); shared(web);
  cp(path.join(tmp, 'app.js'), path.join(web, 'app.js'));
  write(path.join(web, 'index.html'), page('Quiet', 'app.js', { web: true }));
  write(path.join(web, 'manifest.webmanifest'), JSON.stringify({
    name: 'Quiet', short_name: 'Quiet', description: 'A calm companion for your workload and wellbeing.', id: './', start_url: './#/today', scope: './', display: 'standalone',
    background_color: '#F6F5F1', theme_color: '#F6F5F1', orientation: 'any',
    icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }],
    shortcuts: [{ name: 'Brain dump', url: './#/dump' }, { name: 'Today', url: './#/today' }, { name: 'Focus', url: './#/focus' }],
  }, null, 2));
  write(path.join(web, 'sw.js'), fs.readFileSync(R('src/static/sw.js'), 'utf8').replace('__VERSION__', VERSION + '-' + STAMP));
  write(path.join(web, '.nojekyll'), '');

  // ---- Desktop (Electron loads these from a local server) ----
  const desk = R('desktop/app'); rm(desk); shared(desk);
  ['app.js', 'widget.js'].forEach(f => cp(path.join(tmp, f), path.join(desk, f)));
  write(path.join(desk, 'index.html'), page('Quiet', 'app.js', { desktop: true }));
  write(path.join(desk, 'widget.html'), page('Quiet companion', 'widget.js', { desktop: true }));

  rm(tmp); rm(R('dist/_bg'));
  console.log(`Built extension, web and desktop in ${Date.now() - t0} ms`);
}

await build();
if (watch) {
  console.log('Watching src/ …');
  let t; fs.watch(R('src'), { recursive: true }, () => { clearTimeout(t); t = setTimeout(() => build().catch(e => console.error(e.message)), 150); });
}
