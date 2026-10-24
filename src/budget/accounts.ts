import type { Budget, BudgetAccount, BudgetGroup } from '../model/types';

// A generic chart of accounts in the usual film order: above the line, below the line,
// post, other. Short films can leave most accounts empty; empty ones are hidden by default.

export const GROUPS: { id: BudgetGroup; label: string; short: string }[] = [
  { id: 'atl', label: 'Above the line', short: 'ATL' },
  { id: 'btl', label: 'Below the line — production', short: 'BTL' },
  { id: 'post', label: 'Post-production', short: 'Post' },
  { id: 'other', label: 'Other', short: 'Other' },
];

const A = (code: string, name: string, group: BudgetGroup): BudgetAccount => ({ id: `acc-${code}`, code, name, group });

export const DEFAULT_ACCOUNTS: BudgetAccount[] = [
  A('1100', 'Story & Rights', 'atl'),
  A('1200', 'Producers', 'atl'),
  A('1300', 'Director', 'atl'),
  A('1400', 'Cast', 'atl'),
  A('2000', 'Production Staff', 'btl'),
  A('2100', 'Extras', 'btl'),
  A('2200', 'Camera', 'btl'),
  A('2300', 'Grip & Electric', 'btl'),
  A('2400', 'Art & Set Dressing', 'btl'),
  A('2500', 'Props', 'btl'),
  A('2600', 'Wardrobe', 'btl'),
  A('2700', 'Makeup & Hair', 'btl'),
  A('2800', 'Production Sound', 'btl'),
  A('2900', 'Locations', 'btl'),
  A('3000', 'Picture Vehicles', 'btl'),
  A('3100', 'Animals', 'btl'),
  A('3200', 'Special Effects', 'btl'),
  A('3300', 'Stunts', 'btl'),
  A('3400', 'Transportation', 'btl'),
  A('3500', 'Catering & Craft Services', 'btl'),
  A('3600', 'Insurance', 'btl'),
  A('4100', 'Editorial', 'post'),
  A('4200', 'Music', 'post'),
  A('4300', 'Visual Effects', 'post'),
  A('4400', 'Post Sound', 'post'),
  A('4500', 'Color & Deliverables', 'post'),
  A('4600', 'Licensing & Clearances', 'post'),
  A('5100', 'Festivals & Marketing', 'other'),
  A('5200', 'General & Admin', 'other'),
];

/** A starting split for top-down planning (share of the total, before contingency). */
export const TYPICAL_SPLIT: Record<BudgetGroup, number> = { atl: 0.2, btl: 0.55, post: 0.15, other: 0.1 };

export function newBudget(): Budget {
  return {
    currency: 'USD',
    accounts: DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
    lines: [],
    fringes: [{ id: 'fr-payroll', name: 'Payroll taxes & fees', pct: 0 }],
    contingencyPct: 10,
    scenarios: [],
    expenses: [],
    licenses: [],
    paperwork: [],
    clearances: [],
    timecards: [],
    agreements: [],
    fundingSources: [],
    festivalCosts: [],
    festivals: [],
  };
}

export function accountLabel(a: BudgetAccount): string {
  return `${a.code} ${a.name}`;
}
