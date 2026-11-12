// Chunk coach: big tasks become a few small, ordered chunks, shown one at a time.
// Only for tasks of SMALL_TASK minutes or more. A 15-minute task is just done, not planned.
import { llmJSON, aiReady } from './llm.js';
import { SMALL_TASK } from './model.js';

const stub = (title, minutes) => {
  const parts = minutes < 90
    ? [['Get set up', [`Open everything you need for “${title}”`, 'Write down the very first small action']], ['Do the main part', ['Work for 20 minutes without editing or judging', 'Note where you stopped']]]
    : [['Get set up', [`Open everything you need for “${title}”`, 'Set a 25-minute timer', 'Write the very first small action']], ['First push', ['Work on the main part without polishing', 'Stop when the timer ends and note where you are']], ['Second push', ['Pick up from your note and keep going', 'Mark anything you are stuck on']], ['Wrap up', ['Fix one thing from earlier', 'Write the next step for next time']]];
  return parts.map(([t, st]) => ({ title: t, steps: st.map(x => ({ t: x, done: false })) }));
};

export async function chunkify(item, { minutes, energy, attachText = '', smaller = false } = {}) {
  minutes = minutes || item.effort;
  if (item.effort < SMALL_TASK) return null;
  if (!aiReady()) return { chunks: stub(item.title, minutes), cur: 0, offline: true };
  const count = minutes < 90 ? '2-3' : minutes < 180 ? '3-4' : '4-5';
  try {
    const r = await llmJSON({
      system: 'You are a gentle study coach who breaks work into tiny, concrete steps.',
      prompt: `Work session: "${item.title}" — about ${minutes} minutes.${item.notes ? `\nNotes: ${item.notes}` : ''}
Energy right now: ${energy === 1 ? 'low — keep every step very small and gentle' : energy === 4 ? 'high' : 'normal'}.${smaller ? '\nThe user found the last breakdown too big: make every step even smaller.' : ''}
Break it into ${count} ORDERED chunks of 10-25 minutes. Each chunk: a short calm title and 2-4 tiny physical actions (e.g. "Open the paper at the Methods section", "Write 3 bullet points for the intro"). The first chunk must be effortless to start.${attachText ? `\nUse this material so the steps refer to the real content (questions, sections, requirements):\n${attachText.slice(0, 20000)}` : ''}
Reply ONLY with JSON: {"chunks":[{"title":"","steps":["",""]}]}`,
      maxTokens: 2500,
    });
    const chunks = (r.chunks || []).filter(c => c?.title && c.steps?.length).slice(0, 6).map(c => ({ title: String(c.title), steps: c.steps.slice(0, 5).map(t => ({ t: String(t), done: false })) }));
    if (!chunks.length) throw new Error('empty');
    return { chunks, cur: 0 };
  } catch (e) {
    return { chunks: stub(item.title, minutes), cur: 0, offline: true, error: e.message };
  }
}
