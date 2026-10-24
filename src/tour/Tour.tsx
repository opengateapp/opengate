import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { useStore } from '../store/project';
import { openPaperwork } from '../tabs/budget/PaperworkTab';
import { SAMPLE_TOUR } from './sampleTour';

// The tour: a small card (a bottom sheet on phones) that opens each step's tab, highlights what it
// talks about, and steps with Back / Next / Skip. Its parts (the card, the step dots) look like the
// budget guide's.

export const useTour = create<{ step: number | null }>(() => ({ step: null }));
export const startTour = () => useTour.setState({ step: 0 });
const goto = (tab: string) => window.dispatchEvent(new CustomEvent('opengate:goto', { detail: tab }));
const KEY = (id: string) => `opengate.tour.${id}`;

export function Tour() {
  const step = useTour((s) => s.step);
  useEffect(() => {
    const start = () => startTour();
    window.addEventListener('opengate:tour', start);
    return () => window.removeEventListener('opengate:tour', start);
  }, []);
  // Open the step's tab, then highlight its subject.
  useEffect(() => {
    if (step == null) return;
    const s = SAMPLE_TOUR[step];
    if (s.view?.paperwork) openPaperwork(s.view.paperwork); else goto(s.tab);
    let el: Element | null = null;
    const t = setTimeout(() => {
      el = s.anchor ? document.querySelector(s.anchor) : null;
      el?.classList.add('tour-hl');
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 450);
    return () => { clearTimeout(t); el?.classList.remove('tour-hl'); };
  }, [step]);
  if (step == null) return null;
  const s = SAMPLE_TOUR[step];
  const last = step === SAMPLE_TOUR.length - 1;
  const close = () => useTour.setState({ step: null });
  return (
    <div className="tour-card" role="dialog" aria-label="Tour of the sample production">
      <div className="guide-steps" aria-hidden>{SAMPLE_TOUR.map((x, i) => <button key={x.id} className={i === step ? 'active' : i < step ? 'done' : ''} tabIndex={-1} title={x.title} onClick={() => useTour.setState({ step: i })} />)}</div>
      <div className="row"><b>{s.problem && <span aria-hidden>⚠ </span>}{s.title}</b><span className="spacer" /><span className="muted small">{step + 1} of {SAMPLE_TOUR.length}</span></div>
      <p className="small">{s.body}</p>
      <div className="row">
        <button className="small" onClick={close}>{last ? 'Close' : 'Skip the tour'}</button>
        <span className="spacer" />
        {step > 0 && <button className="small" onClick={() => useTour.setState({ step: step - 1 })}>Back</button>}
        {!last && <button className="small primary" onClick={() => useTour.setState({ step: step + 1 })}>Next</button>}
      </div>
    </div>
  );
}

/** "Take the tour?" when the sample production opens. Offered once per sample; never starts by itself. */
export function TourOffer() {
  const p = useStore((s) => s.project);
  const running = useTour((s) => s.step != null);
  const [gone, setGone] = useState(false);
  if (!p?.isSample || running || gone) return null;
  try { if (localStorage.getItem(KEY(p.id))) return null; } catch { /* no storage: offer anyway */ }
  const done = () => { try { localStorage.setItem(KEY(p.id), '1'); } catch { /* ignore */ } setGone(true); };
  return (
    <div className="tour-card tour-offer" role="status">
      <b>Take a tour of the sample?</b>
      <p className="small">A few minutes through every section, stopping at the problems left in on purpose. You can start it later from Help (?).</p>
      <div className="row"><button className="small" onClick={done}>Not now</button><span className="spacer" /><button className="small primary" onClick={() => { done(); startTour(); }}>Take the tour</button></div>
    </div>
  );
}
