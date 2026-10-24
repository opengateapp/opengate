import type { Draft } from 'immer';
import type { BudgetAccount, BudgetLine, PaperDoc, PersonRef, Project } from '../model/types';
import type { Derived } from '../script/derive';
import { personOf, syncPaperworkLines } from '../paperwork/paperwork';
import { shootDays } from '../schedule/dood';

// Plan ↔ Budget: which budget line a person or location feeds, where a line's rate comes from,
// and what's missing upstream. Display and navigation only: the data stays where it is (the deal
// memo, the location's fee), and only people with the budget see any of it.

export type Linkable = PersonRef & { kind: 'cast' | 'crew' | 'location' };

/** The base budget line a cast member, crew member or location feeds, with its account. */
export function lineFor(p: Project, ref: Linkable): { line: BudgetLine; account?: BudgetAccount } | undefined {
  const line = p.budget.lines.find((l) => l.link?.kind === ref.kind && l.link.id === ref.id);
  return line ? { line, account: p.budget.accounts.find((a) => a.id === line.accountId) } : undefined;
}

/** A person's deal memo (the one that sets their rate). */
export function dealFor(p: Project, ref: PersonRef): PaperDoc | undefined {
  return (p.budget.paperwork ?? []).find((d) => d.kind === 'deal' && d.status !== 'na' && d.person.kind === ref.kind && d.person.id === ref.id && !!d.deal);
}

export type RatePer = 'day' | 'week' | 'flat';
/** What a person or location costs, and where that number lives. */
export function rateFor(p: Project, ref: Linkable): { rate: number; per: RatePer; from: 'deal' | 'budget' | 'location' } | undefined {
  if (ref.kind === 'location') {
    const l = p.locations.find((x) => x.id === ref.id);
    return l?.feeAmount != null ? { rate: l.feeAmount, per: l.feePer === 'flat' ? 'flat' : 'day', from: 'location' } : undefined;
  }
  const deal = dealFor(p, ref);
  if (deal?.deal) return { rate: deal.deal.rate, per: deal.deal.per, from: 'deal' };
  const l = lineFor(p, ref)?.line;
  return l ? { rate: l.rate, per: l.units === 'weeks' ? 'week' : l.units === 'flat' || l.units === 'allow' ? 'flat' : 'day', from: 'budget' } : undefined;
}

/** Sets a rate from Plan: on the deal memo when there is one (which updates the line), else on the line. */
export function setRateFor(dr: Draft<Project>, ref: Linkable, rate: number) {
  if (ref.kind === 'location') { const l = dr.locations.find((x) => x.id === ref.id); if (l) l.feeAmount = rate; return; }
  const deal = dealFor(dr as unknown as Project, ref);
  if (deal) {
    const d = dr.budget.paperwork!.find((x) => x.id === deal.id)!;
    d.deal!.rate = rate;
    syncPaperworkLines(dr);
    return;
  }
  const line = dr.budget.lines.find((l) => l.link?.kind === ref.kind && l.link.id === ref.id);
  if (line) line.rate = rate;
}

/** Where a budget line's number comes from, for the line ("Jarls · from his deal memo →"). */
export function lineSource(p: Project, line: BudgetLine): { text: string; tab: string; docId?: string } | undefined {
  const k = line.link?.kind;
  if (k === 'location') return { text: '📍 fee from Plan → Locations', tab: 'locations' };
  if (k !== 'cast' && k !== 'crew') return undefined;
  const ref = { kind: k, id: line.link!.id! } as const;
  const who = personOf(p, ref)?.name ?? 'This person';
  const deal = dealFor(p, ref);
  return deal ? { text: `${who} · rate from the deal memo`, tab: 'paperwork', docId: deal.id } : { text: `${who} · no deal memo yet`, tab: 'paperwork' };
}

export interface PipelineItem { id: string; ok: boolean; label: string; tab: string }

/** What the budget depends on upstream, in pipeline order. Each item jumps to where it's missing. */
export function pipelineChecklist(p: Project, d: Derived): PipelineItem[] {
  const days = shootDays(p).length;
  const people = [...p.cast.map((c) => ({ kind: 'cast' as const, id: c.id })), ...p.crew.map((c) => ({ kind: 'crew' as const, id: c.id }))];
  const noDeal = people.filter((r) => !dealFor(p, r)).length;
  const noFee = p.locations.filter((l) => l.feeAmount == null).length;
  const tagged = p.elements.length > 0 || d.scenes.some((s) => s.taggedElementIds.length);
  return [
    { id: 'script', ok: d.scenes.length > 0, label: d.scenes.length ? `Script (${d.scenes.length} scenes)` : 'No script yet', tab: 'screenplay' },
    { id: 'breakdown', ok: tagged, label: tagged ? 'Breakdown' : 'Nothing tagged in the breakdown', tab: 'breakdown' },
    { id: 'stripboard', ok: days > 0, label: days ? `Stripboard (${days} day${days === 1 ? '' : 's'})` : 'Stripboard: 0 days', tab: 'stripboard' },
    { id: 'crew', ok: p.crew.length > 0, label: p.crew.length ? `${p.crew.length} crew` : 'No crew yet', tab: 'contacts' },
    { id: 'deals', ok: !noDeal, label: noDeal ? `${noDeal} deal memo${noDeal === 1 ? '' : 's'} missing` : 'Deal memos', tab: 'paperwork' },
    { id: 'fees', ok: !noFee, label: noFee ? `${noFee} location${noFee === 1 ? '' : 's'} without a fee` : 'Location fees', tab: 'locations' },
  ];
}
