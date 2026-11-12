// Read an uploaded file so the AI can use it (assignment sheets, syllabi, a photo of the whiteboard).
import { unzipSync, strFromU8 } from 'fflate';

const MAX = 40000;
const vendor = p => new URL(p, document.baseURI).href;

export async function readFile(file) {
  const name = file.name || 'file', type = file.type || '', low = name.toLowerCase();
  if (type.startsWith('image/')) return { name, image: await shrinkImage(file), note: 'image' };
  if (low.endsWith('.pdf') || type === 'application/pdf') return cap(name, await pdfText(file));
  if (low.endsWith('.docx')) return cap(name, docxText(new Uint8Array(await file.arrayBuffer())));
  if (/\.(txt|md|csv|json|tex|rtf|html?)$/.test(low) || type.startsWith('text/')) return cap(name, await file.text());
  throw new Error(`Can't read ${name} — use a PDF, Word, text file or a photo`);
}
const cap = (name, text) => {
  text = String(text || '').replace(/\s+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim();
  if (!text) throw new Error(`${name} has no readable text (is it a scanned PDF? Try a photo instead)`);
  return { name, text: text.slice(0, MAX), chars: text.length, truncated: text.length > MAX };
};

async function pdfText(file) {
  const pdfjs = await import(/* @vite-ignore */ vendor('vendor/pdf.min.mjs'));
  pdfjs.GlobalWorkerOptions.workerSrc = vendor('vendor/pdf.worker.min.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let out = '';
  for (let i = 1; i <= Math.min(doc.numPages, 60) && out.length < MAX; i++) {
    const page = await doc.getPage(i), tc = await page.getTextContent();
    out += tc.items.map(x => x.str + (x.hasEOL ? '\n' : ' ')).join('') + '\n\n';
  }
  return out;
}
function docxText(u8) {
  const files = unzipSync(u8, { filter: f => f.name === 'word/document.xml' });
  const xml = files['word/document.xml'] ? strFromU8(files['word/document.xml']) : '';
  return xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, p => p.replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '') + '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
async function shrinkImage(file, max = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.85).split(',')[1] };
  } finally { URL.revokeObjectURL(url); }
}
