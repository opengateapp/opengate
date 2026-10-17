import { useEffect } from 'react';
import { isPinterestExport, usePinterestInbox } from './pinterest';

/** Listens for boards sent by the "Send to Open Gate" bookmarklet running on pinterest.com. */
export function PinterestReceiver({ onOpen }: { onOpen: () => void }) {
  const setPending = usePinterestInbox((s) => s.set);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      let host = '';
      try { host = new URL(e.origin).hostname; } catch { return; }
      if (!/(^|\.)pinterest\.[a-z.]+$/.test(host)) return;
      if (e.data?.type !== 'slateline-pinterest' || !isPinterestExport(e.data.data)) return;
      (e.source as Window | null)?.postMessage({ type: 'slateline-pinterest-ack' }, e.origin);
      setPending(e.data.data);
      onOpen();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [onOpen, setPending]);
  return null;
}
