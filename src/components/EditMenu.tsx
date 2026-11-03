import { useEffect } from 'react';
import { useStore } from '../store/project';
import { toast } from './common';
import { getBoardClipboard } from './clipboard';

// Edit menu: Undo, Redo, Cut, Copy, Paste, Select all. Acts on whatever has focus —
// a text field, the script or a doc (their own undo history), a board, or the project.

let lastField: HTMLElement | null = null;
const isField = (el: Element | null): el is HTMLElement =>
  !!el && (el.matches('input:not([type=checkbox]):not([type=radio]):not([type=color]):not([type=file]), textarea') || !!(el as HTMLElement).closest?.('[contenteditable="true"]'));

function target(): HTMLElement | null {
  const a = document.activeElement;
  if (isField(a)) return a as HTMLElement;
  return lastField && document.contains(lastField) ? lastField : null;
}

function inProse(el: HTMLElement | null) {
  return !!el?.closest('.ProseMirror');
}

export function runEdit(cmd: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll') {
  const el = target();
  if (cmd === 'undo' || cmd === 'redo') {
    // Text fields and editors keep their own history; everything else (boards, schedule, lists) uses the project's.
    if (el && document.activeElement === el) {
      el.focus();
      if (document.execCommand(cmd)) return;
    }
    const s = useStore.getState();
    if (cmd === 'undo') { if (s.past.length) s.undo(); else toast('Nothing to undo'); }
    else { if (s.future.length) s.redo(); else toast('Nothing to redo'); }
    return;
  }
  if (cmd === 'selectAll') {
    if (el) { el.focus(); document.execCommand('selectAll'); }
    return;
  }
  if (cmd === 'cut' || cmd === 'copy') {
    if (el) el.focus();
    // Fires the page's copy/cut handlers too (boards copy their selected items).
    if (!document.execCommand(cmd)) toast(`Use ${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+'}${cmd === 'cut' ? 'X' : 'C'} to ${cmd}`);
    return;
  }
  // Paste: browsers only allow reading the clipboard through the async API.
  void (async () => {
    if (!el && getBoardClipboard().length) { window.dispatchEvent(new Event('slateline:board-paste')); return; }
    try {
      const text = await navigator.clipboard.readText();
      if (!el) { toast('Click where you want to paste first'); return; }
      el.focus();
      if (inProse(el) || el.isContentEditable) document.execCommand('insertText', false, text);
      else if (!document.execCommand('insertText', false, text)) {
        const i = el as HTMLInputElement;
        i.setRangeText(text, i.selectionStart ?? i.value.length, i.selectionEnd ?? i.value.length, 'end');
        i.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch {
      toast(`Use ${navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+'}V to paste — the browser blocked clipboard access from the menu`);
    }
  })();
}

const MOD = typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+';
const ITEMS: { cmd: Parameters<typeof runEdit>[0]; label: string; key: string }[] = [
  { cmd: 'undo', label: 'Undo', key: `${MOD}Z` },
  { cmd: 'redo', label: 'Redo', key: `⇧${MOD}Z` },
  { cmd: 'cut', label: 'Cut', key: `${MOD}X` },
  { cmd: 'copy', label: 'Copy', key: `${MOD}C` },
  { cmd: 'paste', label: 'Paste', key: `${MOD}V` },
  { cmd: 'selectAll', label: 'Select all', key: `${MOD}A` },
];

/** The ↶ ↷ buttons, which stay in the bar. Also remembers the last field, for the Edit menu. */
export function UndoRedo() {
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  useEffect(() => {
    const focus = (e: FocusEvent) => { if (isField(e.target as Element)) lastField = e.target as HTMLElement; };
    document.addEventListener('focusin', focus);
    return () => document.removeEventListener('focusin', focus);
  }, []);
  // onMouseDown + preventDefault keeps focus (and the text selection) where it was.
  const act = (cmd: 'undo' | 'redo') => (e: React.MouseEvent) => { e.preventDefault(); runEdit(cmd); };
  return (
    <div className="edit-menu">
      <button className="icon-btn" title={`Undo (${MOD}Z)`} aria-label="Undo" onMouseDown={act('undo')} disabled={!canUndo && !target()}>↶</button>
      <button className="icon-btn" title={`Redo (⇧${MOD}Z)`} aria-label="Redo" onMouseDown={act('redo')} disabled={!canRedo && !target()}>↷</button>
    </div>
  );
}

/** The Edit menu's items. */
export function EditMenuItems({ onDone }: { onDone: () => void }) {
  return (
    <>
      {ITEMS.map((i) => (
        <button key={i.cmd} onMouseDown={(e) => { e.preventDefault(); runEdit(i.cmd); onDone(); }} onClick={(e) => { if (e.detail === 0) { runEdit(i.cmd); onDone(); } }}><span>{i.label}</span><kbd>{i.key}</kbd></button>
      ))}
    </>
  );
}
