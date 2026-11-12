// Provider-agnostic LLM client. Your key stays in your own storage (and your own Google Drive
// app folder when sync is on); requests go straight from your device to the provider.
import { store } from './store.js';

export const PROVIDERS = {
  groq: { name: 'Groq', note: 'Free tier, very fast', keyUrl: 'https://console.groq.com/keys', keyHint: 'gsk_…', models: ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b'], vision: 'meta-llama/llama-4-scout-17b-16e-instruct', whisper: 'whisper-large-v3-turbo' },
  gemini: { name: 'Google Gemini', note: 'Free tier available', keyUrl: 'https://aistudio.google.com/apikey', keyHint: 'AIza…', models: ['gemini-2.5-flash', 'gemini-2.5-pro'], audio: true },
  openai: { name: 'OpenAI', note: 'Paid', keyUrl: 'https://platform.openai.com/api-keys', keyHint: 'sk-…', models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini'], whisper: 'whisper-1' },
  anthropic: { name: 'Anthropic Claude', note: 'Paid', keyUrl: 'https://console.anthropic.com/settings/keys', keyHint: 'sk-ant-…', models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] },
};

export function aiConfig() {
  const p = store.prefs(), prov = PROVIDERS[p.aiProvider] ? p.aiProvider : null;
  return { provider: prov, key: (p.aiKey || '').trim(), model: p.aiModel || (prov ? PROVIDERS[prov].models[0] : '') };
}
export const aiReady = () => { const c = aiConfig(); return !!(c.provider && c.key); };

const parseJSON = txt => {
  const m = String(txt || '').match(/\{[\s\S]*\}/);
  if (!m) throw new Error('The AI reply was not JSON');
  return JSON.parse(m[0]);
};
async function jfetch(url, opts, label) {
  let r;
  try { r = await fetch(url, opts); } catch (e) { throw new Error(`Can't reach ${label} — are you online?`); }
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  if (!r.ok) {
    const msg = j?.error?.message || j?.error?.status || t.slice(0, 200) || 'HTTP ' + r.status;
    const e = new Error(r.status === 401 || r.status === 403 ? `${label} rejected the API key` : r.status === 429 ? `${label} rate limit — try again in a minute` : msg);
    e.status = r.status; throw e;
  }
  return j;
}

/** Ask for a JSON object. images: [{mime, data(base64)}] */
export async function llmJSON({ system, prompt, schema = null, images = [], maxTokens = 4000, cfg = aiConfig() }) {
  const { provider, key, model } = cfg;
  if (!provider || !key) throw new Error('No AI key yet');
  const sys = (system || 'You are a careful assistant.') + ' Reply with a single valid JSON object and nothing else.';
  if (provider === 'anthropic') return parseJSON(await anthropicCall({ key, model, sys, prompt, images, schema, maxTokens }));
  if (provider === 'gemini') {
    const parts = [{ text: prompt }, ...images.map(i => ({ inline_data: { mime_type: i.mime, data: i.data } }))];
    const j = await jfetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: maxTokens } }),
    }, 'Gemini');
    return parseJSON(j?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join(''));
  }
  // OpenAI-compatible (Groq, OpenAI)
  const base = provider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1';
  const useModel = images.length && provider === 'groq' ? PROVIDERS.groq.vision : model;
  const content = images.length ? [{ type: 'text', text: prompt }, ...images.map(i => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.data}` } }))] : prompt;
  const body = { model: useModel, temperature: 0.2, messages: [{ role: 'system', content: sys }, { role: 'user', content }], response_format: { type: 'json_object' } };
  if (provider === 'groq') { body.max_completion_tokens = maxTokens; if (/gpt-oss/.test(useModel)) body.reasoning_effort = 'low'; } else body.max_tokens = maxTokens;
  const label = PROVIDERS[provider].name;
  try {
    const j = await jfetch(base + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(body) }, label);
    return parseJSON(j.choices?.[0]?.message?.content);
  } catch (e) {
    if (e.status === 400 || e.status === 404) { // retry without JSON mode / with a model the key can use
      delete body.response_format;
      if (e.status === 404 && provider === 'groq') body.model = await groqFallbackModel(key);
      const j = await jfetch(base + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(body) }, label);
      return parseJSON(j.choices?.[0]?.message?.content);
    }
    throw e;
  }
}

async function groqFallbackModel(key) {
  const j = await jfetch('https://api.groq.com/openai/v1/models', { headers: { authorization: 'Bearer ' + key } }, 'Groq');
  const ids = (j.data || []).map(m => m.id), bad = /guard|whisper|tts|orpheus|compound|prompt/;
  return PROVIDERS.groq.models.find(m => ids.includes(m)) || ids.find(i => !bad.test(i));
}

async function anthropicCall({ key, model, sys, prompt, images, schema, maxTokens }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  const content = [...images.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.data } })), { type: 'text', text: prompt }];
  const base = { model, max_tokens: Math.max(maxTokens, 4000), system: sys, messages: [{ role: 'user', content }] };
  const withFallback = /^claude-(opus|sonnet)-5-5$/.test(model);
  const run = async fmt => {
    const req = { ...base, output_config: { effort: 'low', ...(fmt ? { format: { type: 'json_schema', schema: fmt } } : {}) } };
    const res = withFallback
      ? await client.beta.messages.create({ ...req, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.messages.create(req);
    if (res.stop_reason === 'refusal') throw new Error('Claude declined this request');
    return res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  };
  try { return await run(schema); }
  catch (e) {
    if (e?.status === 401) throw new Error('Anthropic rejected the API key');
    if (schema && e?.status === 400) return run(null); // schema not accepted: fall back to prompt-only JSON
    throw new Error(e?.message || 'Anthropic request failed');
  }
}

/** Speech-to-text for platforms without built-in dictation. */
export async function transcribe(blob) {
  const { provider, key } = aiConfig();
  if (!key) throw new Error('Voice needs an AI key on this device');
  if (provider === 'groq' || provider === 'openai') {
    const fd = new FormData(); fd.append('file', blob, 'voice.webm'); fd.append('model', PROVIDERS[provider].whisper);
    const j = await jfetch((provider === 'groq' ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1') + '/audio/transcriptions', { method: 'POST', headers: { authorization: 'Bearer ' + key }, body: fd }, PROVIDERS[provider].name);
    return j.text || '';
  }
  if (provider === 'gemini') {
    const data = await blobToB64(blob);
    const j = await jfetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Transcribe this voice note exactly. Reply with only the transcript.' }, { inline_data: { mime_type: blob.type || 'audio/webm', data } }] }] }) }, 'Gemini');
    return j?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || '';
  }
  throw new Error('Voice typing needs a Groq, OpenAI or Gemini key on this device');
}
export const blobToB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });

export async function testAI(cfg) {
  const r = await llmJSON({ cfg, prompt: 'Return {"ok": true}.', maxTokens: 400 });
  return !!r;
}
