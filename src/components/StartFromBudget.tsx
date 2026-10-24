import { useMemo, useState } from 'react';
import type { Draft } from 'immer';
import type { Project, WritingHave, WritingKind, WritingLimitsSet, WritingPlan } from '../model/types';
import { newProject } from '../model/defaults';
import { useStore } from '../store/project';
import { budgetToLimits } from '../budget/writingLimits';
import { money as fmt } from '../budget/calc';
import { Modal } from './common';
import { openReference } from '../tabs/ReferenceTab';

// "Start from a budget": the money and what you have → what that buys → a project (or the open one)
// with limits to write within. Rough rules of thumb, and every limit can be changed.

const KINDS: { id: WritingKind; label: string }[] = [
  { id: 'short', label: 'A short film' }, { id: 'feature', label: 'A feature' }, { id: 'music', label: 'A music video' }, { id: 'other', label: 'Something else' },
];
const TIERS = ['Micro-Budget Project', 'Short Project (SPA)', 'Ultra Low Project (UPA)'];
const LIMIT_LABELS: [keyof WritingLimitsSet, string][] = [
  ['shootDays', 'Shoot days'], ['locations', 'Locations'], ['speakingRoles', 'Speaking roles'], ['crew', 'Crew (with you)'], ['pagesMin', 'Pages, at least'], ['pagesMax', 'Pages, at most'], ['nightScenes', 'Night scenes'],
];
const list = (s: string) => s.split(/[,\n;]/).map((x) => x.trim()).filter(Boolean);

/** Applies a plan to a project: limits on, the budget cap and the shooting pace. */
function applyPlan(dr: Draft<Project> | Project, plan: WritingPlan) {
  dr.writingPlan = plan;
  dr.budget.targetTotal = plan.money;
  dr.budget.funding = { ...dr.budget.funding, pagesPerDay: plan.have.pagesPerDay };
  if (plan.have.unionTier) dr.production.agreement = { union: 'SAG-AFTRA', tier: plan.have.unionTier };
}

export function StartFromBudget({ onClose, onCreate }: { onClose: () => void; /** Home: open the new project. Without it, the plan goes on the open project. */ onCreate?: (p: Project) => void }) {
  const cur = useStore((s) => s.project);
  const update = useStore((s) => s.update);
  const prev = onCreate ? undefined : cur?.writingPlan;
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [money, setMoney] = useState(prev?.money ? String(prev.money) : '');
  const [kind, setKind] = useState<WritingKind>(prev?.have.kind ?? 'short');
  const [gear, setGear] = useState(prev?.have.gear ?? true);
  const [locs, setLocs] = useState(prev?.have.locations.join(', ') ?? '');
  const [extras, setExtras] = useState(prev?.have.extras?.join(', ') ?? '');
  const [helpers, setHelpers] = useState(String(prev?.have.helpers ?? 2));
  const [tier, setTier] = useState(prev?.have.unionTier ?? '');
  const [ppd, setPpd] = useState(String(prev?.have.pagesPerDay ?? 4));
  const [edits, setEdits] = useState<Partial<WritingLimitsSet>>({});
  const amount = Math.max(0, Number(money.replace(/[^0-9.]/g, '')) || 0);
  const have: WritingHave = { kind, gear, locations: list(locs), helpers: Math.max(0, Math.round(Number(helpers) || 0)), unionTier: tier || undefined, pagesPerDay: Math.max(1, Number(ppd) || 4), extras: list(extras) };
  const result = useMemo(() => budgetToLimits(amount, have), [amount, JSON.stringify(have)]); // eslint-disable-line react-hooks/exhaustive-deps
  const limits = { ...result.limits, ...edits };
  const $ = (n: number) => fmt(n, 'USD');

  const finish = () => {
    const plan: WritingPlan = { money: amount, have, limits, perLocation: result.perLocation, on: true };
    if (onCreate) {
      const p = newProject(title.trim() || 'Untitled Screenplay');
      applyPlan(p, plan);
      onCreate(p);
    } else update((dr) => applyPlan(dr, plan), 'Writing to a budget');
    onClose();
  };

  const body = step === 0 ? (
    <>
      <p>Know how much you can spend, but not what to write? Tell us the money and what you have. You’ll get limits to write within: shoot days, locations, speaking roles and pages.</p>
      {onCreate && <label className="field"><span>Working title</span><input value={title} placeholder="Untitled Screenplay" onChange={(e) => setTitle(e.target.value)} /></label>}
      <label className="field"><span>Your money, all in (USD)</span><input inputMode="decimal" value={money} placeholder="e.g. 10000" onChange={(e) => setMoney(e.target.value)} autoFocus /></label>
      <div className="field"><span>What are you making?</span>
        <div className="row wrap">{KINDS.map((k) => <button key={k.id} className={kind === k.id ? 'active' : ''} aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</button>)}</div>
      </div>
    </>
  ) : step === 1 ? (
    <>
      <p>What do you already have? Every free thing is money for something else.</p>
      <label className="check-row"><input type="checkbox" checked={gear} onChange={(e) => setGear(e.target.checked)} /> I own or can borrow a camera, lights and sound</label>
      <label className="field"><span>Places you can shoot for free or cheap</span><input value={locs} placeholder="my apartment, a friend’s diner, my car" onChange={(e) => setLocs(e.target.value)} /></label>
      <label className="field"><span>Things you could put on screen</span><input value={extras} placeholder="a dog, a vintage car, a wedding dress" onChange={(e) => setExtras(e.target.value)} /></label>
      <div className="row wrap">
        <label className="field"><span>People helping free or cheap</span><input inputMode="numeric" value={helpers} onChange={(e) => setHelpers(e.target.value)} /></label>
        <label className="field"><span>Script pages a day (rough)</span><input inputMode="decimal" value={ppd} onChange={(e) => setPpd(e.target.value)} /></label>
      </div>
      <label className="field"><span>A union actor?</span>
        <select value={tier} onChange={(e) => setTier(e.target.value)}>
          <option value="">No, non-union actors</option>
          {TIERS.map((t) => <option key={t} value={t}>Yes, SAG-AFTRA {t}</option>)}
        </select>
      </label>
    </>
  ) : (
    <>
      <p>{amount ? <>With <b>{$(amount)}</b></> : 'With no money set'} that’s roughly:</p>
      <div className="limit-grid">
        {LIMIT_LABELS.map(([k, label]) => (
          <label key={k} className="field"><span>{label}</span>
            <input inputMode="numeric" value={limits[k]} onChange={(e) => setEdits((x) => ({ ...x, [k]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))} />
          </label>
        ))}
      </div>
      <p className="muted small">
        Rough rules of thumb: {$(result.shoot)} for the shoot after setting aside post, festivals, insurance and a 10% contingency; crew at about $200 a day, {tier ? 'SAG-AFTRA actors at $257 a day plus 22% pension & health' : 'actors at about $125 a day'}, $20 a day for food per person{gear ? '' : ', $300 a day for rented gear'}.
        Change any number. <button className="link small" onClick={() => openReference('writing-to-budget')}>Writing to a budget</button>
      </p>
    </>
  );
  const last = step === 2;
  return (
    <Modal title="Start from a budget" onClose={onClose} footer={<>
      <span className="muted small">Step {step + 1} of 3</span>
      <span className="spacer" />
      {step > 0 && <button onClick={() => setStep(step - 1)}>Back</button>}
      {last ? <button className="primary" onClick={finish}>{onCreate ? 'Start writing' : 'Use these limits'}</button> : <button className="primary" onClick={() => setStep(step + 1)}>Next</button>}
    </>}>
      {body}
    </Modal>
  );
}
