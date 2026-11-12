// Speak instead of typing. Uses the browser's own dictation where it works (Chrome, Android,
// Safari); otherwise records a short clip and transcribes it with your AI provider (Whisper/Gemini).
import { transcribe, aiConfig } from '../core/llm.js';
import { isDesktop, isExt } from '../core/platform.js';

const SR = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
const canRecord = () => !!(globalThis.MediaRecorder && navigator.mediaDevices?.getUserMedia);
const whisperOK = () => ['groq', 'openai', 'gemini'].includes(aiConfig().provider) && !!aiConfig().key;
export const voiceAvailable = () => (!!SR && !isDesktop) || (canRecord() && whisperOK());

export async function startVoice({ onText, onEnd, onError }) {
  if (SR && !isDesktop) {
    const r = new SR(); r.lang = navigator.language || 'en-IN'; r.continuous = true; r.interimResults = true;
    let final = '';
    r.onresult = e => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) final += t + ' '; else interim += t; } onText((final + interim).trim()); };
    r.onerror = e => { if (e.error === 'not-allowed') onError(isExt ? 'Microphone blocked. Open Quiet in a tab (not the popup) and allow the microphone.' : 'Microphone permission was denied.'); else if (e.error !== 'aborted' && e.error !== 'no-speech') onError('Dictation stopped: ' + e.error); };
    r.onend = () => onEnd();
    r.start();
    return { stop: () => r.stop() };
  }
  if (!canRecord() || !whisperOK()) throw new Error('Voice typing needs a Groq, OpenAI or Gemini key on this device (You → AI).');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mr = new MediaRecorder(stream), chunks = [];
  mr.ondataavailable = e => e.data.size && chunks.push(e.data);
  mr.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());
    try { onText('…transcribing'); const txt = await transcribe(new Blob(chunks, { type: mr.mimeType || 'audio/webm' })); onText(txt); } catch (e) { onError(e.message); onText(''); }
    onEnd();
  };
  mr.start();
  const auto = setTimeout(() => mr.state === 'recording' && mr.stop(), 120e3);
  return { stop: () => { clearTimeout(auto); if (mr.state === 'recording') mr.stop(); } };
}
