import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { Modal } from './common';

// In-app confirm / text dialogs. The browser's own confirm() and prompt() are
// silently blocked in some embedded browsers, which made every delete do nothing.

interface Pending {
  kind: 'confirm' | 'text';
  title: string;
  message?: string;
  confirmLabel: string;
  danger?: boolean;
  placeholder?: string;
  initial?: string;
  resolve: (v: boolean | string | null) => void;
}

const useDialogs = create<{ pending: Pending | null }>(() => ({ pending: null }));

export function askConfirm(title: string, opts: { message?: string; confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    useDialogs.setState({ pending: { kind: 'confirm', title, message: opts.message, confirmLabel: opts.confirmLabel ?? 'Delete', danger: opts.danger ?? true, resolve: (v) => resolve(v === true) } });
  });
}

export function askText(title: string, opts: { placeholder?: string; initial?: string; confirmLabel?: string; message?: string } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    useDialogs.setState({ pending: { kind: 'text', title, message: opts.message, placeholder: opts.placeholder, initial: opts.initial, confirmLabel: opts.confirmLabel ?? 'OK', resolve: (v) => resolve(typeof v === 'string' ? v : null) } });
  });
}

export function DialogHost() {
  const pending = useDialogs((s) => s.pending);
  const [text, setText] = useState('');
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!pending) return;
    setText(pending.initial ?? '');
    if (pending.kind === 'confirm') setTimeout(() => ok.current?.focus(), 0);
  }, [pending]);
  if (!pending) return null;
  const close = (v: boolean | string | null) => { useDialogs.setState({ pending: null }); pending.resolve(v); };
  const accept = () => close(pending.kind === 'text' ? text : true);
  return (
    <Modal title={pending.title} onClose={() => close(pending.kind === 'text' ? null : false)} footer={
      <>
        <button onClick={() => close(pending.kind === 'text' ? null : false)}>Cancel</button>
        <button ref={ok} className={pending.danger ? 'danger-btn' : 'primary'} onClick={accept}>{pending.confirmLabel}</button>
      </>
    }>
      {pending.message && <p>{pending.message}</p>}
      {pending.kind === 'text' && (
        <input autoFocus value={text} placeholder={pending.placeholder} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') accept(); }} />
      )}
    </Modal>
  );
}
