import { render } from 'preact';
import { App } from '../ui/App.jsx';
import { store } from '../core/store.js';
import { MASCOT_CSS } from '../ui/mascot.js';
import { isWeb } from '../core/platform.js';

document.head.insertAdjacentHTML('beforeend', `<style>${MASCOT_CSS}</style>`);
addEventListener('beforeinstallprompt', e => { e.preventDefault(); globalThis.__quietInstall = e; dispatchEvent(new Event('quiet-install')); });
if (isWeb && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
// Netlify's free plan injects a "Powered by Netlify" badge in the bottom-right corner. Keep our buttons clear of it.
if (isWeb && document.querySelector('script[src*="/.netlify/scripts/hud"]')) document.documentElement.classList.add('has-badge');
store.init().then(() => render(<App />, document.getElementById('root')));
