// Quiet's shared AI: lets every user (phone, browser, desktop) use AI without their own key.
// The Groq key lives ONLY in Netlify's environment variables (GROQ_API_KEY) — never in the app.
// To change it for everyone: Netlify → Project configuration → Environment variables → GROQ_API_KEY,
// then redeploy (npm run deploy).
// Nothing sent here is stored or logged.

const ALLOWED = new Set([
  'https://quiet-calm-planner.netlify.app',
  'chrome-extension://ahdcidmacoljiikibjbmghjjdmbhpnmf',
  'http://127.0.0.1:47821', 'http://127.0.0.1:47822', 'http://127.0.0.1:47823', 'http://127.0.0.1:47824',
  'http://localhost:5173',
]);
const MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];
const VISION = ['qwen/qwen3.8-27b']; // reads photos of assignment sheets
const hits = new Map(); // simple per-IP rate limit (per warm instance)
const LIMIT = 40, WINDOW = 10 * 60e3;

const json = (status, body, origin) => new Response(JSON.stringify(body), { status, headers: {
  'content-type': 'application/json',
  ...(origin ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {}),
} });

export default async (req, context) => {
  const origin = req.headers.get('origin') || '';
  const ok = ALLOWED.has(origin) || /^https:\/\/[a-z0-9]+--quiet-calm-planner\.netlify\.app$/.test(origin);
  if (req.method === 'OPTIONS') {
    if (!ok) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'Origin' } });
  }
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (!ok) return json(403, { error: 'Not allowed' });

  const key = (globalThis.Netlify?.env?.get('GROQ_API_KEY') || process.env.GROQ_API_KEY || '').trim();
  if (!key) return json(503, { error: 'Quiet AI isn’t set up yet' }, origin);

  const ip = context?.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown', now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW);
  if (recent.length >= LIMIT) return json(429, { error: 'Quiet AI is busy — try again in a few minutes' }, origin);
  recent.push(now); hits.set(ip, recent);

  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Bad request' }, origin); }
  const system = String(body.system || '').slice(0, 4000);
  const prompt = String(body.prompt || '').slice(0, 60000);
  const images = Array.isArray(body.images) ? body.images.slice(0, 2).filter(i => i && /^image\/(jpeg|png|webp)$/.test(i.mime) && typeof i.data === 'string' && i.data.length < 2_000_000) : [];
  const maxTokens = Math.max(200, Math.min(6000, +body.maxTokens || 3000));
  if (!prompt) return json(400, { error: 'Empty request' }, origin);

  const content = images.length ? [{ type: 'text', text: prompt }, ...images.map(i => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.data}` } }))] : prompt;
  const messages = [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content }];
  const attempts = (images.length ? VISION : MODELS).flatMap(model => [{ model, jsonMode: true }, { model, jsonMode: false }]);
  for (const { model, jsonMode } of attempts) {
    const req2 = { model, temperature: 0.2, max_completion_tokens: maxTokens, messages };
    if (jsonMode) req2.response_format = { type: 'json_object' };
    if (/gpt-oss/.test(model)) req2.reasoning_effort = 'low';
    if (/qwen/.test(model)) req2.reasoning_format = 'hidden';
    let r;
    try { r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(req2) }); }
    catch { return json(502, { error: 'Couldn’t reach the AI provider' }, origin); }
    if (r.status === 400 || r.status === 404) continue; // JSON mode refused → same model without it; model retired → next model
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) return json(503, { error: 'Quiet AI’s key needs updating' }, origin);
    if (r.status === 429) return json(429, { error: 'Quiet AI is busy — try again in a minute' }, origin);
    if (!r.ok) return json(502, { error: 'The AI provider had a problem' }, origin);
    return json(200, { text: j.choices?.[0]?.message?.content || '' }, origin);
  }
  return json(502, { error: 'No AI model available right now' }, origin);
};

export const config = { path: '/api/ai' };
