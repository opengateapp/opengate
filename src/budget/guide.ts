import type { BudgetAccount, BudgetLine, BudgetScenario, Project } from '../model/types';
import type { Derived } from '../script/derive';
import { newId } from '../model/ids';
import { GUILDS } from '../reference/guilds';
import { budgetView } from './pipeline';
import { totals } from './calc';

// Help for first-time budgeters: the production agreement's budget limit, ranked ways to cut when
// over the cap (each can be tried as a version), a worked $10k example, and plain explanations of
// budget words. No union rate tables: the example's SAG-AFTRA figures say when they were checked.

export const GUIDE_CHECKED = '2026-10-23';

// ---------------------------------------------------------------- agreement limits

/** "$20K" → 20000, "$300K*" → 300000, "$2M" → 2000000; undefined when it isn't a single amount. */
export function parseLimit(s: string | undefined): number | undefined {
  const m = s?.replace(/,/g, '').match(/^\s*(?:under\s*|≤\s*|<\s*)?\$(\d+(?:\.\d+)?)\s*([KM])?\*?\s*$/i);
  if (!m) return undefined;
  return Number(m[1]) * (m[2]?.toUpperCase() === 'M' ? 1e6 : m[2]?.toUpperCase() === 'K' ? 1e3 : 1);
}

/** The SAG-AFTRA single-project tiers in order of budget limit (others are for students, verticals or series). */
const SAG_LADDER = ['Micro-Budget Project', 'Short Project (SPA)', 'Ultra Low Project (UPA)', 'Moderate Low (MPA)', 'Low Budget (LBA)'];

export interface AgreementCheck { union: string; tier: string; limit: number; over: boolean; next?: { name: string; limit?: number; fits: string } }

/** Whether the budget has outgrown the production agreement's tier, and which tier fits instead. */
export function agreementCheck(p: Project, total: number): AgreementCheck | null {
  const ag = p.production.agreement;
  if (!ag?.union || !ag.tier) return null;
  const guild = GUILDS.find((g) => /sag/i.test(g.id) && /sag/i.test(ag.union!)) ?? GUILDS.find((g) => g.name === ag.union);
  const tier = guild?.agreements?.find((a) => a.name === ag.tier);
  const limit = tier ? parseLimit(tier.budget) : undefined;
  if (!guild || !tier || limit === undefined) return null;
  const over = total > limit;
  let next: AgreementCheck['next'];
  if (over) {
    const i = SAG_LADDER.indexOf(tier.name);
    const up = (guild.agreements ?? []).filter((a) => SAG_LADDER.indexOf(a.name) > i).sort((a, b) => SAG_LADDER.indexOf(a.name) - SAG_LADDER.indexOf(b.name));
    const fit = up.find((a) => (parseLimit(a.budget) ?? Infinity) >= total) ?? up[up.length - 1];
    if (fit) next = { name: fit.name, limit: parseLimit(fit.budget), fits: fit.fits };
  }
  return { union: ag.union, tier: tier.name, limit, over, next };
}

// ---------------------------------------------------------------- cut suggestions

export interface Cut { id: string; label: string; effect: string; saves: number; scenario: Omit<BudgetScenario, 'id' | 'name'> }

/** Ways to come in under the cap, ranked by money saved. Each can be tried as a budget version. */
export function cutSuggestions(p: Project, d: Derived): Cut[] {
  const v = budgetView(p, d);
  const t = totals(p.budget, v.lines);
  const lineTotal = (id: string) => t.lineTotal.get(id) ?? 0;
  const withMarkup = (n: number) => (t.subtotal ? n * (t.total / t.subtotal) : n);
  const cuts: Cut[] = [];
  // One fewer shoot day: everything that follows the schedule shrinks.
  const days = v.facts.shootDays;
  if (days > 1) {
    const sc = { shootDays: days - 1, overrides: {}, added: [] };
    const fewer = totals(p.budget, budgetView({ ...p, budget: { ...p.budget, scenarios: [...p.budget.scenarios, { id: '__try', name: '', ...sc }] } }, d, '__try').lines).total;
    const shrink = v.lines.filter((l) => l.link?.auto && (l.link.kind === 'crew' || l.link.kind === 'shootDays')).length;
    cuts.push({ id: 'day', label: `Shoot in ${days - 1} day${days - 1 === 1 ? '' : 's'} instead of ${days}`, effect: `Crew and day-rate gear lines (${shrink}) shrink with it; you’d need to fit the pages into fewer days.`, saves: Math.round(t.total - fewer), scenario: sc });
  }
  // Rented gear: own or borrow instead.
  const rented = v.lines.filter((l) => l.link?.kind === 'gear' && (p.gear ?? []).find((g) => g.id === l.link!.id)?.source === 'rent');
  if (rented.length) {
    const saves = withMarkup(rented.reduce((a, l) => a + lineTotal(l.id), 0));
    cuts.push({ id: 'gear', label: 'Borrow or use owned gear instead of renting', effect: `${rented.length} rental line${rented.length === 1 ? '' : 's'}: ${rented.map((l) => l.description).join(', ')}.`, saves: Math.round(saves), scenario: { overrides: Object.fromEntries(rented.map((l) => [l.id, { removed: true }])), added: [] } });
  }
  // Locations: drop the costliest one (shoot its scenes somewhere you already have).
  const locs = v.lines.filter((l) => l.link?.kind === 'location' && lineTotal(l.id) > 0).sort((a, b) => lineTotal(b.id) - lineTotal(a.id));
  if (locs.length > 1) {
    const l = locs[0];
    cuts.push({ id: 'location', label: `Merge locations: lose “${l.description.replace(/^Location fee — /, '')}”`, effect: 'Rewrite or re-stage its scenes at a location you already have.', saves: Math.round(withMarkup(lineTotal(l.id))), scenario: { overrides: { [l.id]: { removed: true } }, added: [] } });
  }
  // Crew: the most expensive role that isn't a head of department you can't shoot without.
  const keep = /director of photography|\bdp\b|sound|director$|^director/i;
  const crew = v.lines.filter((l) => l.link?.kind === 'crew' && lineTotal(l.id) > 0 && !keep.test(l.description)).sort((a, b) => lineTotal(b.id) - lineTotal(a.id));
  if (crew.length) {
    const l = crew[0];
    cuts.push({ id: 'crew', label: `A smaller crew: without ${l.description}`, effect: 'Someone else covers the job, or it waits until you can afford it.', saves: Math.round(withMarkup(lineTotal(l.id))), scenario: { overrides: { [l.id]: { removed: true } }, added: [] } });
  }
  // Your own fee: defer it.
  const own = v.lines.filter((l) => /\b(director|producer|writer)\b/i.test(l.description) && !/assistant|photography/i.test(l.description) && lineTotal(l.id) > 0);
  if (own.length) {
    cuts.push({ id: 'defer', label: 'Defer your own fee', effect: `${own.map((l) => l.description).join(', ')}: paid later, if the film earns money.`, saves: Math.round(withMarkup(own.reduce((a, l) => a + lineTotal(l.id), 0))), scenario: { overrides: Object.fromEntries(own.map((l) => [l.id, { rate: 0 }])), added: [] } });
  }
  return cuts.filter((c) => c.saves > 0).sort((a, b) => b.saves - a.saves);
}

// ---------------------------------------------------------------- the worked example

interface ExLine { acc: string; d: string; u: BudgetLine['units']; qty: number; x?: number; rate: number; why: string }

/** A $10,000, 3-day short with one SAG-AFTRA Ultra Low actor. Sample numbers, explained line by line. */
export const WORKED_EXAMPLE: ExLine[] = [
  { acc: '1400', d: 'Lead actor (SAG-AFTRA Ultra Low)', u: 'days', qty: 3, rate: 257, why: `Ultra Low Project day rate from 7/1/2026 (checked on sagaftra.org ${GUIDE_CHECKED}). Pension & health (22%) is added as a fringe.` },
  { acc: '1400', d: 'Supporting actors (non-union)', u: 'days', qty: 3, x: 2, rate: 125, why: 'Two actors at a fair non-union day rate.' },
  { acc: '2200', d: 'Director of photography', u: 'days', qty: 3, rate: 350, why: 'Brings their own camera kit (no rental).' },
  { acc: '2800', d: 'Production sound mixer (with kit)', u: 'days', qty: 3, rate: 275, why: 'Good sound saves the film in post.' },
  { acc: '2300', d: 'Gaffer / grip', u: 'days', qty: 3, rate: 225, why: 'One person for lighting and rigging.' },
  { acc: '2000', d: 'Production assistants', u: 'days', qty: 3, x: 2, rate: 125, why: 'Runs, lock-ups, set-up and wrap.' },
  { acc: '2300', d: 'Lighting package rental', u: 'rentdays', qty: 3, rate: 125, why: 'A small LED kit; a rental "week" is billed as 3 days.' },
  { acc: '2200', d: 'Lens adapter, cards and a backup drive', u: 'flat', qty: 1, rate: 250, why: 'Bought, not rented: you keep them.' },
  { acc: '2900', d: 'Locations (fees and permits)', u: 'flat', qty: 1, rate: 500, why: 'One paid location plus a permit; the rest are free.' },
  { acc: '3500', d: 'Meals & craft services', u: 'each', qty: 3, x: 12, rate: 20, why: '$20 a person a day for about 12 people.' },
  { acc: '2400', d: 'Art, props and wardrobe', u: 'allow', qty: 1, rate: 350, why: 'An allowance until you itemise it.' },
  { acc: '3400', d: 'Transport and fuel', u: 'allow', qty: 1, rate: 200, why: 'Vans, fuel, parking.' },
  { acc: '3600', d: 'Production insurance (short-term)', u: 'flat', qty: 1, rate: 400, why: 'Locations and rental houses ask for a certificate.' },
  { acc: '4100', d: 'Edit, sound mix and colour', u: 'flat', qty: 1, rate: 900, why: 'Post on a friendly rate.' },
  { acc: '5100', d: 'Festivals & marketing', u: 'allow', qty: 1, rate: 400, why: 'Festival fees, a poster and a DCP.' },
];
export const EXAMPLE_PH_PCT = 22;

/** The example as budget lines (in your accounts), with each line's reason as its note. */
export function workedExampleLines(accounts: BudgetAccount[], phFringeId?: string): BudgetLine[] {
  const byCode = new Map(accounts.map((a) => [a.code, a.id]));
  return WORKED_EXAMPLE.map((l, i) => ({
    id: newId(), accountId: byCode.get(l.acc) ?? accounts[0].id, description: l.d, qty: l.qty, units: l.u, x: l.x ?? 1, rate: l.rate,
    fringeIds: i === 0 && phFringeId ? [phFringeId] : [], notes: `Worked example: ${l.why}`,
  }));
}

/** The example's total (lines + P&H on the lead + 10% contingency), for the preview. */
export function workedExampleTotal(): number {
  const rentBilled = (q: number) => Math.floor(q / 7) * 3 + Math.min(q % 7, 3);
  const sub = WORKED_EXAMPLE.reduce((a, l) => a + (l.u === 'rentdays' ? rentBilled(l.qty) : l.qty) * (l.x ?? 1) * l.rate, 0) + WORKED_EXAMPLE[0].qty * WORKED_EXAMPLE[0].rate * EXAMPLE_PH_PCT / 100;
  return Math.round(sub * 1.1);
}

// ---------------------------------------------------------------- budget words

/** Plain explanations for budget words, each pointing at a Reference page. */
export const BUDGET_TERMS: Record<string, { tip: string; ref: string }> = {
  atl: { tip: 'Above the line: the creative leads — writer, director, producers, main cast. Usually agreed first.', ref: 'budget-terms' },
  btl: { tip: 'Below the line: everything that makes the film — crew, gear, locations, food, transport.', ref: 'budget-terms' },
  post: { tip: 'Post-production: edit, sound mix, music, colour, VFX and deliverables.', ref: 'budget-how' },
  other: { tip: 'Everything else: insurance, legal, festivals and marketing.', ref: 'budget-how' },
  fringe: { tip: 'Fringes are costs on top of wages: payroll taxes, workers’ comp, union pension & health. They’re a % of the wages they’re ticked on.', ref: 'budget-terms' },
  contingency: { tip: 'A safety margin for surprises, usually 10% of the subtotal. You will need it.', ref: 'budget-terms' },
  kit: { tip: 'A kit fee pays someone for using their own gear (a sound kit, a makeup kit).', ref: 'budget-deals' },
  rental: { tip: 'Rental week: rental houses often charge 3 days for a 7-day week. Change it in Settings.', ref: 'budget-deals' },
  etc: { tip: 'ETC = estimate to complete: what’s still to spend. EFC = estimated final cost: spent + committed + ETC.', ref: 'budget-tracking' },
  linked: { tip: '⛓ This line’s “How long” follows the script and schedule (days someone works, days at a location). Type a number to take over.', ref: 'budget-how' },
  allow: { tip: 'An allowance is a lump sum for something you can’t itemise yet (art, props).', ref: 'budget-how' },
  units: { tip: 'What “How long” counts: days, weeks, hours, each, rental days (billed by the rental week), a flat fee or an allowance.', ref: 'budget-deals' },
};

/** Adds a cut as a new budget version (the base budget is untouched). Call inside an update(). Returns its id. */
export function addCutVersion(p: Project, cut: Cut): string {
  const id = newId();
  p.budget.scenarios.push({ id, name: `Try: ${cut.label}`, ...structuredClone(cut.scenario) });
  return id;
}
