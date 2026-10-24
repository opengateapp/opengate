import { useMemo, useState } from 'react';
import { useDerived, useProject, useStore } from '../store/project';
import { canEdit } from '../sync/state';
import { money, totals } from '../budget/calc';
import { budgetView } from '../budget/pipeline';
import { storyPrompts, writingCheck } from '../budget/writingLimits';
import { StartFromBudget } from './StartFromBudget';
import { RefLink } from '../tabs/ReferenceTab';

// Write → Limits: the script measured against what the money buys, while you write.

export function LimitsPanel({ onGo }: { onGo: (sceneId: string) => void }) {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const plan = p.writingPlan;
  const check = useMemo(() => (plan ? writingCheck(p, d, plan) : null), [p, d, plan]);
  const budgeted = useMemo(() => (p.budget.lines.length ? totals(p.budget, budgetView(p, d).lines).total : 0), [p, d]);
  const ro = !canEdit('writingPlan');
  if (!plan || !check) return null;
  const L = plan.limits;
  const $ = (n: number) => money(n, p.budget.currency);
  const sceneNo = new Map(d.scenes.map((s) => [s.id, s.number]));
  const scenes = (ids: string[]) => (
    <span className="row wrap small"><span className="muted">Scene{ids.length === 1 ? '' : 's'}</span>{ids.map((id) => <button key={id} className="link small" onClick={() => onGo(id)}>{sceneNo.get(id) ?? '?'}</button>)}</span>
  );
  const meter = (id: string, label: string, have: number, max: number, detail: React.ReactNode, min?: number) => {
    const over = have > max;
    return (
      <div key={id}>
        <button className={`meter ${over ? 'over' : ''}`} aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>
          <span>{label}</span><b>{have} of {min != null ? `${min}–${max}` : max}</b>
          <span className="bar"><span style={{ width: `${Math.min(100, max ? (have / max) * 100 : 100)}%` }} /></span>
        </button>
        {open === id && <div className="small">{detail}</div>}
      </div>
    );
  };
  const notesBy = new Map<string, string[]>();
  for (const n of check.notes) notesBy.set(n.sceneId, [...(notesBy.get(n.sceneId) ?? []), n.text]);
  return (
    <div className="limits-panel">
      <div className="row"><b>Writing to {$(plan.money)}</b><span className="spacer" />{!ro && <button className="link small" onClick={() => setEdit(true)}>Change</button>}</div>
      {budgeted > 0 && <span className={`small ${budgeted > plan.money ? 'over' : 'under'}`}>Budget so far: {$(budgeted)} of {$(plan.money)}</span>}
      {meter('pages', 'Pages', Math.round(check.pages * 10) / 10, L.pagesMax, <span className="muted">About {L.pagesMin}–{L.pagesMax} pages fits {L.shootDays} shoot days at {plan.have.pagesPerDay} a day.</span>, L.pagesMin)}
      {meter('days', 'Shoot days (estimated)', check.estDays, L.shootDays, <span className="muted">{check.pages.toFixed(1)} pages ÷ {plan.have.pagesPerDay} a day.</span>)}
      {meter('locations', 'Locations', check.locations.length, L.locations, <ul>{check.locations.map((l) => <li key={l.name}>{l.name} {scenes(l.sceneIds)}</li>)}</ul>)}
      {meter('roles', 'Speaking roles', check.speakingRoles.length, L.speakingRoles, <ul>{check.speakingRoles.map((c) => <li key={c}>{c}</li>)}</ul>)}
      {meter('nights', 'Night scenes', check.nightSceneIds.length, L.nightScenes, check.nightSceneIds.length ? scenes(check.nightSceneIds) : <span className="muted">None yet.</span>)}

      {check.notes.length > 0 && (
        <>
          <h4>Over the plan</h4>
          <ul>{[...notesBy].map(([id, texts]) => <li key={id}><button className="link small" onClick={() => onGo(id)}>Scene {sceneNo.get(id)}</button>: <span className="small">{texts.join(' ')}</span></li>)}</ul>
        </>
      )}
      {check.flags.length > 0 && (
        <>
          <h4>Things that cost money</h4>
          {check.flags.map((f) => (
            <div key={f.id} className="limit-flag">
              <span><b>{f.label}</b> <span className="muted small">{f.sceneIds.length} scene{f.sceneIds.length === 1 ? '' : 's'}</span></span>
              <span className="muted small">{f.why}</span>
              {scenes(f.sceneIds)}
            </div>
          ))}
        </>
      )}
      <h4>Story ideas from what you have</h4>
      <ul>{storyPrompts(plan.have).map((s) => <li key={s} className="small">{s}</li>)}</ul>
      <span className="small">Why these limits <RefLink page="writing-to-budget" /></span>
      {!ro && <button className="link small" onClick={() => update((dr) => { if (dr.writingPlan) dr.writingPlan.on = false; }, 'Hide writing limits')}>Hide the Limits tab</button>}
      {edit && <StartFromBudget onClose={() => setEdit(false)} />}
    </div>
  );
}
