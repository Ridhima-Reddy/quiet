// Tiny static server for testing the web/phone build locally: node tools/serve.mjs [dir] [port]
// On your phone (same Wi-Fi) open http://<your-laptop-ip>:<port> — note: install-as-app and
// Google sign-in need HTTPS, so for the real phone app use the hosted version (see README).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve(process.argv[2] || 'dist/web'), port = +(process.argv[3] || 5173);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  let f = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(dir)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(f).pipe(res);
}).listen(port, () => console.log(`Serving ${dir} at http://localhost:${port}`));
