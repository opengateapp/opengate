import type { Draft } from 'immer';
import type { BudgetLine, CrowdPlan, FundingKind, FundingPlan, FundingSource, FundingStatus, Project } from '../model/types';
import type { Derived } from '../script/derive';
import { newId } from '../model/ids';
import { budgetFacts, crewAccount, importFromBreakdown, usesEstimate } from './fromBreakdown';
import { budgetView } from './pipeline';
import { totals } from './calc';
import { missingMarketingLines } from './templates';

// Budget → Funding: from a broken-down script to "how much do I need to raise?". Shoot days are
// estimated from page count until there's a schedule, starter rates fill in only the rates you
// haven't set, the things people forget are checked, and the gap is worked out against the money
// you have or expect. The crowdfunding goal is grossed up for fees and the real cost of rewards.

export const DEFAULT_PAGES_PER_DAY = 3;

export const FUNDING_KINDS: { id: FundingKind; label: string; hint: string }[] = [
  { id: 'cash', label: 'Your own money', hint: 'Savings or the company’s cash' },
  { id: 'inkind', label: 'In-kind', hint: 'Gear, locations, food or services given instead of money' },
  { id: 'deferral', label: 'Deferred pay', hint: 'Pay promised later: it reduces what you need now' },
  { id: 'grant', label: 'Grant', hint: 'Arts councils, film funds, foundations' },
  { id: 'investor', label: 'Investor / equity', hint: 'Money for a share of what the film earns' },
  { id: 'crowdfunding', label: 'Crowdfunding', hint: 'Net of fees and rewards (see the goal calculator)' },
  { id: 'sponsor', label: 'Sponsor / product placement', hint: 'A brand paying or giving product' },
  { id: 'presale', label: 'Pre-sale / MG', hint: 'A distributor paying ahead' },
  { id: 'incentive', label: 'Tax incentive', hint: 'Arrives after the shoot: you have to cash-flow it' },
  { id: 'loan', label: 'Loan', hint: 'Has to be paid back, often with interest' },
  { id: 'other', label: 'Other', hint: '' },
];
export const FUNDING_STATUSES: { id: FundingStatus; label: string }[] = [
  { id: 'idea', label: 'Idea' }, { id: 'applied', label: 'Applied / asked' }, { id: 'pledged', label: 'Promised' }, { id: 'received', label: 'In the bank' },
];

export const newFundingSource = (kind: FundingKind = 'cash'): FundingSource => ({ id: newId(), kind, name: '', amount: 0, status: 'idea' });

// ---------------------------------------------------------------- starter rates

export type FundingLevel = NonNullable<FundingPlan['level']>;
export const LEVELS: { id: FundingLevel; label: string; hint: string }[] = [
  { id: 'none', label: 'No budget', hint: 'Friends and favours: food, gear and costs only' },
  { id: 'micro', label: 'Micro', hint: 'Low day rates for crew and non-union actors' },
  { id: 'indie', label: 'Indie (SAG-AFTRA Ultra Low)', hint: 'Union performers at $257/day (UPA, 7/1/2026), modest crew rates' },
];

/** Example rates by level (USD): what to type in until you have real quotes. */
const STARTER: Record<FundingLevel, { cast: number; crew: number; dp: number; location: number; meal: number; element: Record<string, number> }> = {
  none: { cast: 0, crew: 0, dp: 0, location: 0, meal: 12, element: { props: 40, wardrobe: 40, makeup: 30, setDressing: 40, sfx: 40, vehicles: 0, animals: 0, stunts: 0, extras: 0, vfx: 0, music: 0, equipment: 0, security: 0, misc: 50, sound: 0, camera: 0, greenery: 20, mechfx: 40, labor: 0 } },
  micro: { cast: 125, crew: 150, dp: 300, location: 150, meal: 15, element: { props: 100, wardrobe: 120, makeup: 60, setDressing: 100, sfx: 150, vehicles: 50, animals: 150, stunts: 300, extras: 0, vfx: 250, music: 250, equipment: 50, security: 75, misc: 100, sound: 50, camera: 50, greenery: 50, mechfx: 150, labor: 120 } },
  indie: { cast: 257, crew: 250, dp: 450, location: 300, meal: 20, element: { props: 250, wardrobe: 300, makeup: 150, setDressing: 250, sfx: 400, vehicles: 100, animals: 300, stunts: 600, extras: 20, vfx: 600, music: 500, equipment: 100, security: 150, misc: 200, sound: 100, camera: 100, greenery: 100, mechfx: 400, labor: 200 } },
};
export const STARTER_NOTE = 'Starter rate (example): replace it with a real quote or deal.';

/** The example rate for a line at a level, or null when there isn't one (it's left alone). */
export function starterRate(p: Project, l: BudgetLine, level: FundingLevel): number | null {
  const s = STARTER[level];
  switch (l.link?.kind) {
    case 'cast': case 'castHold': return s.cast;
    case 'crew': {
      const c = p.crew.find((x) => x.id === l.link!.id);
      return c && crewAccount(c.role) === '2200' && /photograph|\bdp\b|\bdop\b|cinematograph/i.test(c.role) ? s.dp : s.crew;
    }
    case 'location': return s.location;
    case 'headcount': return s.meal;
    case 'element': {
      const e = p.elements.find((x) => x.id === l.link!.id);
      return e ? s.element[e.categoryId] ?? null : null;
    }
    default: return null;
  }
}

/**
 * "Quick estimate": adds the breakdown's lines (cast, crew, locations, elements, meals) and fills
 * starter rates into lines whose rate is still 0 and that have no note. Never changes a rate you
 * typed or a $0 you explained. Returns how many
 * lines it added and how many rates it filled.
 */
export function quickEstimate(dr: Draft<Project>, d: Derived, level: FundingLevel, pagesPerDay = DEFAULT_PAGES_PER_DAY): { added: number; filled: number } {
  dr.budget.funding = { ...dr.budget.funding, level, pagesPerDay };
  const p = dr as unknown as Project;
  const lines = importFromBreakdown(p, budgetFacts(p, d));
  dr.budget.lines.push(...lines);
  let filled = 0;
  for (const l of dr.budget.lines) {
    // A rate you typed, or a $0 you explained in a note ("volunteers", "paid through the trainer"), stays.
    if (l.rate || l.notes?.trim()) continue;
    const r = starterRate(p, l as BudgetLine, level);
    if (r === null || r === 0) continue;
    l.rate = r;
    l.notes = l.notes ? `${l.notes} ${STARTER_NOTE}` : STARTER_NOTE;
    filled++;
  }
  return { added: lines.length, filled };
}

// ---------------------------------------------------------------- things people forget

export interface Check { id: string; label: string; ok: boolean; detail: string; ref: string; fix?: (dr: Draft<Project>) => number }

const addLine = (dr: Draft<Project>, code: string, description: string, units: BudgetLine['units'], qty: number, rate: number) => {
  const acc = dr.budget.accounts.find((a) => a.code === code) ?? dr.budget.accounts.find((a) => a.group === 'btl') ?? dr.budget.accounts[0];
  dr.budget.lines.push({ id: newId(), accountId: acc.id, description, qty, units, x: 1, rate, fringeIds: [], notes: STARTER_NOTE });
  return 1;
};

/** What a beginner's budget usually leaves out, each with a fix. */
export function forgottenItems(p: Project, d: Derived): Check[] {
  const t = totals(p.budget, budgetView(p, d).lines);
  const acc = (code: string) => { const a = p.budget.accounts.find((x) => x.code === code); return a ? t.byAccount.get(a.id)?.total ?? 0 : 0; };
  const has = (re: RegExp) => p.budget.lines.some((l) => re.test(l.description));
  const postTotal = p.budget.accounts.filter((a) => a.group === 'post').reduce((s, a) => s + (t.byAccount.get(a.id)?.total ?? 0), 0);
  const musicInScript = p.elements.some((e) => e.categoryId === 'music');
  const checks: Check[] = [
    { id: 'contingency', label: 'Contingency', ok: (p.budget.contingencyPct ?? 0) > 0, detail: 'A safety margin, usually 10%.', ref: 'budget-terms', fix: (dr) => { dr.budget.contingencyPct = 10; return 1; } },
    { id: 'insurance', label: 'Insurance', ok: acc('3600') > 0, detail: 'Locations and rental houses will ask for a certificate. Budget roughly 2.5% of the total for a short.', ref: 'insurance', fix: (dr) => addLine(dr, '3600', 'Production insurance (short-term)', 'flat', 1, Math.max(300, Math.round(t.subtotal * 0.025 / 50) * 50)) },
    { id: 'legal', label: 'Legal & accounting', ok: acc('5200') > 0 || has(/legal|lawyer|account/i), detail: 'Chain of title, contracts, the company, bookkeeping.', ref: 'legal-lawyer', fix: (dr) => addLine(dr, '5200', 'Legal & accounting', 'allow', 1, 500) },
    { id: 'post', label: 'Post-production', ok: postTotal > 0, detail: 'Edit, sound mix, colour, deliverables: often as much as the shoot.', ref: 'budget-how', fix: (dr) => addLine(dr, '4100', 'Editor', 'weeks', 2, 0) + addLine(dr, '4400', 'Sound mix', 'flat', 1, 0) + addLine(dr, '4500', 'Colour grade & deliverables', 'flat', 1, 0) },
    { id: 'music', label: 'Music', ok: !musicInScript || acc('4200') > 0 || acc('4600') > 0 || (p.budget.licenses ?? []).length > 0, detail: musicInScript ? 'Your script has music in it: licences or a composer.' : 'No music tagged in the script.', ref: 'legal-music', fix: musicInScript ? (dr) => addLine(dr, '4200', 'Music licences / composer', 'allow', 1, 0) : undefined },
    { id: 'marketing', label: 'Marketing & festivals', ok: acc('5100') > 0, detail: 'Stills, key art, trailer, festival fees, DCP, travel.', ref: 'marketing', fix: (dr) => { const add = missingMarketingLines(dr.budget.accounts as never, dr.budget.lines as never); dr.budget.lines.push(...add); return add.length; } },
    { id: 'meals', label: 'Food', ok: acc('3500') > 0, detail: 'Feed everyone, every day. Nobody works for free on an empty stomach.', ref: 'budget-how' },
  ];
  if (p.locations.length) checks.push({ id: 'locations', label: 'Location fees & permits', ok: acc('2900') > 0, detail: 'Fees, permits, parking, toilets.', ref: 'legal-releases' });
  return checks;
}

// ---------------------------------------------------------------- how much to raise

/** In-kind, deferrals and secured money reduce what you need now; incentives only arrive after the shoot. */
export interface RaiseSummary {
  total: number;
  /** Needed before and through the shoot (above + below the line), and after it (post, marketing, other). */
  before: number;
  after: number;
  secured: number;
  hoped: number;
  incentivesAfter: number;
  /** Still to raise counting only money promised or in the bank. */
  toRaise: number;
  /** Still to raise if everything you've applied for comes through. */
  toRaiseIfAll: number;
  /** Money needed before the shoot that isn't secured yet. */
  shortBeforeShoot: number;
  estimated: boolean;
}

const SECURE: FundingStatus[] = ['pledged', 'received'];

export function raiseSummary(p: Project, d: Derived): RaiseSummary {
  const t = totals(p.budget, budgetView(p, d).lines);
  const groupShare = (t.byGroup.atl + t.byGroup.btl) / Math.max(1, t.subtotal);
  const before = Math.round(t.total * groupShare);
  const after = Math.round(t.total - before);
  const src = p.budget.fundingSources ?? [];
  const sum = (f: (s: FundingSource) => boolean) => src.filter(f).reduce((a, s) => a + (Number(s.amount) || 0), 0);
  const secured = sum((s) => s.kind !== 'incentive' && SECURE.includes(s.status));
  const hoped = sum((s) => s.kind !== 'incentive' && !SECURE.includes(s.status));
  const incentivesAfter = sum((s) => s.kind === 'incentive');
  return {
    total: Math.round(t.total), before, after, secured, hoped, incentivesAfter,
    toRaise: Math.max(0, Math.round(t.total - secured)),
    toRaiseIfAll: Math.max(0, Math.round(t.total - secured - hoped)),
    shortBeforeShoot: Math.max(0, Math.round(before - secured)),
    estimated: usesEstimate(p),
  };
}

// ---------------------------------------------------------------- crowdfunding goal

export const PLATFORMS: { id: string; label: string; feePct: number; processingPct: number; perPledge: number; note: string; threshold?: number }[] = [
  { id: 'kickstarter', label: 'Kickstarter', feePct: 5, processingPct: 3, perPledge: 0.3, note: 'All-or-nothing. 5% + 3% + $0.30 per pledge (US).' },
  { id: 'indiegogo', label: 'Indiegogo', feePct: 5, processingPct: 3, perPledge: 0.2, note: 'Fixed (all-or-nothing) for new campaigns. 5% + 3% + $0.20.' },
  { id: 'seedandspark', label: 'Seed&Spark', feePct: 0, processingPct: 2.9, perPledge: 0.3, note: 'No platform fee; funds once you reach 80% of the goal.', threshold: 80 },
  { id: 'gofundme', label: 'GoFundMe', feePct: 0, processingPct: 2.9, perPledge: 0.3, note: 'Donations, not rewards. 2.9% + $0.30 (US).' },
  { id: 'ulule', label: 'Ulule', feePct: 8, processingPct: 0, perPledge: 0, note: '8% incl. VAT on card payments.' },
  { id: 'custom', label: 'Other / custom', feePct: 5, processingPct: 3, perPledge: 0.3, note: 'Type your platform’s fees.' },
];

export const defaultCrowd = (): CrowdPlan => ({
  platform: 'kickstarter', feePct: 5, processingPct: 3, perPledge: 0.3, pledgeMgrPct: 0, taxReservePct: 0, noRewardPct: 10,
  tiers: [
    { id: newId(), name: 'Thank you + digital download', price: 25, backers: 60, costEach: 0, shipEach: 0 },
    { id: newId(), name: 'Poster', price: 50, backers: 30, costEach: 15, shipEach: 8 },
    { id: newId(), name: 'Credit in the film', price: 100, backers: 15, costEach: 0, shipEach: 0 },
    { id: newId(), name: 'Set visit', price: 250, backers: 4, costEach: 20, shipEach: 0 },
  ],
});

export interface CrowdResult {
  /** Set the goal to this… */
  goal: number;
  /** …to have this much left for the film. */
  net: number;
  backers: number;
  avgPledge: number;
  fees: number;
  rewards: number;
  /** Rewards as a share of pledges (after no-reward pledges). */
  rewardPct: number;
  /** Per tier: what fulfilling it costs at the goal. */
  tierCosts: { id: string; name: string; backers: number; cost: number; margin: number }[];
  /** The goal can't be reached: rewards and fees take everything. */
  impossible: boolean;
}

/**
 * The goal that leaves `net` for the film after platform and processing fees, a pledge manager,
 * a tax reserve and the cost of making and posting rewards. Reward tiers set the average pledge
 * and how much of each pledge rewards eat; they're scaled to the goal.
 */
export function crowdfundingGoal(net: number, c: CrowdPlan): CrowdResult {
  const tiers = c.tiers.filter((t) => t.price > 0 && t.backers > 0);
  const gross = tiers.reduce((a, t) => a + t.price * t.backers, 0);
  const count = tiers.reduce((a, t) => a + t.backers, 0);
  const avgPledge = count ? gross / count : 50;
  const rewardCost = tiers.reduce((a, t) => a + (t.costEach + t.shipEach) * t.backers, 0);
  const rewardPct = gross ? (rewardCost / gross) * (1 - (c.noRewardPct || 0) / 100) : 0;
  const pct = (c.feePct + c.processingPct + c.pledgeMgrPct + c.taxReservePct) / 100;
  const perPledgePct = avgPledge ? c.perPledge / avgPledge : 0;
  const keep = 1 - pct - rewardPct - perPledgePct;
  if (keep <= 0.05 || net <= 0) {
    return { goal: 0, net, backers: 0, avgPledge, fees: 0, rewards: 0, rewardPct, tierCosts: [], impossible: net > 0 };
  }
  const goal = Math.ceil(net / keep / 50) * 50;
  const backers = Math.round(goal / avgPledge);
  const scale = gross ? goal / gross : 0;
  const rewards = Math.round(goal * rewardPct);
  const fees = Math.round(goal * pct + backers * c.perPledge);
  const tierCosts = tiers.map((t) => {
    const n = Math.round(t.backers * scale * (1 - (c.noRewardPct || 0) / 100));
    const each = t.costEach + t.shipEach;
    return { id: t.id, name: t.name, backers: n, cost: Math.round(n * each), margin: t.price ? 1 - (each + t.price * (pct + perPledgePct)) / t.price : 0 };
  });
  return { goal, net, backers, avgPledge, fees, rewards, rewardPct, tierCosts, impossible: false };
}
