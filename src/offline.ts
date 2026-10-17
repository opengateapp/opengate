import { toast } from './components/common';

// Offline support: the service worker (built by vite.config.ts) caches the app, so once
// it has been opened online it also opens with no internet — in the browser or installed
// as a desktop app. Projects live in this browser's storage, which we ask to keep for good.

export function startOffline() {
  if (typeof window === 'undefined') return;
  // Ask the browser not to clear project storage when space runs low (or after weeks unused).
  void navigator.storage?.persist?.().catch(() => {});

  if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) {
              toast('A new version of Open Gate is ready', { label: 'Reload', run: () => location.reload() });
            }
          });
        });
      }).catch((e) => console.warn('Offline support unavailable', e));
    });
  }

  window.addEventListener('offline', () => toast("You're offline — keep working. Everything saves here and syncs when you're back."));
  window.addEventListener('online', () => toast('Back online'));
}

/** Install prompt for the desktop app (Chrome / Edge). */
let deferred: (Event & { prompt: () => Promise<void> }) | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as typeof deferred; listeners.forEach((l) => l()); });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((l) => l()); });
}
export function canInstall() { return !!deferred; }
export function onInstallChange(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
export async function installApp() { if (deferred) { await deferred.prompt(); deferred = null; listeners.forEach((l) => l()); } }
