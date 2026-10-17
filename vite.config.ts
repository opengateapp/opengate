/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Writes sw.js at build time with the list of every built file, so the installed app
 * works with no internet (the service worker caches the whole app on first visit).
 */
function offlineServiceWorker(): Plugin {
  return {
    name: 'open-gate-offline',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const extra = ['./', 'index.html', 'manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'brand/open-gate-logo.svg', 'brand/open-gate-logo.png'];
      const version = Date.now().toString(36);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `// Open Gate offline support (generated at build time).
const CACHE = 'open-gate-${version}';
const FILES = ${JSON.stringify([...new Set([...extra, ...files])])};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('open-gate-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'skip-waiting') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never cache the collaboration relay (it's live data).
  if (url.pathname.startsWith('/r/')) return;
  // Fonts: keep a copy so the app looks right offline.
  if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // Pages: network first (to get updates), cached app when offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('index.html', { ignoreSearch: true }).then((r) => r || caches.match('./'))));
    return;
  }
  // Built files are versioned by name: cache first.
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok) caches.open(CACHE).then((c) => c.put(req, r.clone()));
    return r;
  })));
});
`,
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), offlineServiceWorker()],
  base: './',
  server: { port: 5173 },
  test: { environment: 'jsdom' },
});
