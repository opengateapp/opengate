import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import changelog from '../../CHANGELOG.md?raw';
import { useStore, getDerived } from '../store/project';
import { Modal, toast } from '../components/common';
import { openReference } from '../tabs/ReferenceTab';
import { appContext, issueUrl, safeSummary, type IssueKind } from './feedback';
import { FaqView } from './FaqView';

// Help: the "?" menu next to ⤓ and ⚙, and the same links in Settings → About, the Home footer
// and the phone drawer. Feedback opens GitHub issue forms after a note that they're public.

type Dialog = { kind: 'feedback'; issue: IssueKind; tab?: string } | { kind: 'news' } | { kind: 'faq' } | null;
export const useHelp = create<{ dialog: Dialog }>(() => ({ dialog: null }));
const show = (dialog: Dialog) => useHelp.setState({ dialog });
const goto = (tab: string) => window.dispatchEvent(new CustomEvent('opengate:goto', { detail: tab }));

/** Opens the FAQ: the Reference page inside a project, a window on Home. */
export function openFaq() {
  if (useStore.getState().project) openReference('faq'); else show({ kind: 'faq' });
}

export interface HelpItem { id: string; label: string; hint: string; run: () => void; project?: boolean }
export function helpItems(tab?: string): HelpItem[] {
  return [
    { id: 'faq', label: 'FAQ', hint: 'Why Open Gate works the way it does; your data, sharing, phones', run: openFaq },
    { id: 'feedback', label: 'Send feedback or an idea', hint: 'A GitHub form, filled in with your app version', run: () => show({ kind: 'feedback', issue: 'feature', tab }) },
    { id: 'bug', label: 'Report a bug', hint: 'Something didn’t work: tell us on GitHub', run: () => show({ kind: 'feedback', issue: 'bug', tab }) },
    { id: 'news', label: 'What’s new', hint: `The release notes (you have ${appContext().version})`, run: () => show({ kind: 'news' }) },
    { id: 'tour', label: 'Tour of the sample production', hint: 'A walk through every section, stopping at the problems to fix', run: () => (useStore.getState().project?.isSample ? window.dispatchEvent(new Event('opengate:tour')) : toast('The tour walks through the sample production: open it from Home → Try the sample production.')), project: true },
    { id: 'shortcuts', label: 'Keyboard shortcuts', hint: 'Settings → Keyboard shortcuts', run: () => { goto('setup'); setTimeout(() => window.dispatchEvent(new CustomEvent('opengate:settings', { detail: 'shortcuts' })), 0); }, project: true },
  ];
}

/** The "?" in the top bar. */
export function HelpMenu({ tab }: { tab: string }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  // Escape closes the menu and puts focus back on "?".
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);
  return (
    <span className="help-menu">
      <button ref={btn} className={`icon-btn settings-btn ${open ? 'active' : ''}`} title="Help, FAQ and feedback" aria-label="Help" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((x) => !x)}>?</button>
      {open && (
        <>
          <div className="help-backdrop" onClick={() => setOpen(false)} />
          <div className="section-flyout help-flyout" role="menu" aria-label="Help">
            {helpItems(tab).map((it) => <button key={it.id} role="menuitem" onClick={() => { setOpen(false); it.run(); }}><b>{it.label}</b><span>{it.hint}</span></button>)}
          </div>
        </>
      )}
    </span>
  );
}

/** The same links as a list (Settings → About, Home, the phone drawer). */
export function HelpLinks({ tab, home }: { tab?: string; home?: boolean }) {
  return (
    <div className="help-links row wrap">
      {helpItems(tab).filter((it) => !home || !it.project).map((it) => <button key={it.id} className="link small" title={it.hint} onClick={it.run}>{it.label}</button>)}
    </div>
  );
}

const ISSUE_LABEL: Record<IssueKind, string> = { bug: 'Report a bug', feature: 'Suggest a feature or send feedback', question: 'Ask a question', resource: 'Suggest a resource' };

/** Whichever help window is open. Rendered once by the app and by Home. */
export function HelpDialogs() {
  const dialog = useHelp((s) => s.dialog);
  const close = () => show(null);
  if (!dialog) return null;
  if (dialog.kind === 'faq') return <Modal title="Questions about Open Gate" onClose={close} wide><FaqView /></Modal>;
  if (dialog.kind === 'news') return <Modal title="What’s new" onClose={close} wide><Changelog /></Modal>;
  return <FeedbackDialog issue={dialog.issue} tab={dialog.tab} onClose={close} />;
}

function FeedbackDialog({ issue: first, tab, onClose }: { issue: IssueKind; tab?: string; onClose: () => void }) {
  const [issue, setIssue] = useState<IssueKind>(first);
  const p = useStore((s) => s.project);
  const c = appContext(tab);
  const copySummary = async () => {
    if (!p) return;
    try { await navigator.clipboard.writeText(safeSummary(p, getDerived())); toast('Copied: counts only, no names or text. Paste it into the form if it helps.'); } catch { toast('Your browser didn’t allow copying.'); }
  };
  return (
    <Modal title={ISSUE_LABEL[issue]} onClose={onClose} footer={<>
      <span className="spacer" />
      <button onClick={onClose}>Cancel</button>
      <a className="button-like primary" href={issueUrl(issue, tab)} target="_blank" rel="noreferrer noopener" onClick={() => setTimeout(onClose, 0)}>Open GitHub ↗</a>
    </>}>
      <div className="seg small" role="radiogroup" aria-label="Kind">
        {(['bug', 'feature', 'question'] as const).map((k) => <button key={k} role="radio" aria-checked={issue === k} className={issue === k ? 'active' : ''} onClick={() => setIssue(k)}>{{ bug: 'Bug', feature: 'Idea or feedback', question: 'Question' }[k]}</button>)}
      </div>
      <p><b>GitHub issues are public.</b> Don’t include private details from your project (names, script text, money). You need a free GitHub account to post.</p>
      <p className="small">The form will be filled in with: version <b>{c.version}</b> · {c.environment}{tab ? ` · tab: ${tab}` : ''}. Nothing from your project is sent.</p>
      {p && issue === 'bug' && <p className="small">If the bug involves your project, <button className="link small" onClick={() => void copySummary()}>copy a safe summary</button> (counts only: scenes, pages, cast, days…) and paste it in.</p>}
    </Modal>
  );
}

/** CHANGELOG.md, shown simply: release headings, paragraphs and nested bullets. */
function Changelog() {
  const lines = changelog.split('\n').filter((l) => !/^# Changelog/.test(l));
  return (
    <div className="changelog">
      {lines.map((l, i) => {
        const m = l.match(/^(\s*)- (.*)$/);
        const inline = (t: string) => t.split(/(\*\*[^*]+\*\*)/).map((x, j) => (x.startsWith('**') ? <b key={j}>{x.slice(2, -2)}</b> : x.replace(/\*([^*]+)\*/g, '$1')));
        if (/^## /.test(l)) return <h3 key={i}>{l.slice(3)}</h3>;
        if (m) return <p key={i} className="changelog-item" style={{ paddingLeft: 12 + m[1].length * 8 }}>• {inline(m[2])}</p>;
        if (l.trim()) return <p key={i}>{inline(l)}</p>;
        return null;
      })}
    </div>
  );
}
