import type { BudgetLine, Project } from '../model/types';
import type { Derived } from '../script/derive';
import { finalizeLines, scenarioLines } from './calc';
import type { Vars } from './expr';
import { breakdownFacts, resolveLines, type BreakdownFacts } from './fromBreakdown';

// From the stored budget to the lines that get added up — one path for the screen, version
// comparison, PDF and spreadsheet: linked quantities → version changes → formulas and sub-items.

/** Named numbers every formula can use: the production's own counts plus the budget's globals. */
export function budgetVars(p: Project, d: Derived, f: BreakdownFacts, shootDays = f.shootDays): Vars {
  const pages = d.scenes.reduce((a, s) => a + (p.sceneMeta[s.id]?.eighthsOverride ?? s.eighths), 0) / 8;
  const vars: Vars = {
    SHOOT_DAYS: shootDays,
    SHOOT_WEEKS: Math.ceil(shootDays / 5),
    CAST: f.cast.length,
    CREW: p.crew.length,
    LOCATIONS: p.locations.length,
    SCENES: d.scenes.length,
    PAGES: Math.round(pages * 100) / 100,
    PERSON_DAYS: f.personDays,
  };
  for (const g of p.budget.globals ?? []) {
    const name = g.name.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (name) vars[name] = Number(g.value) || 0;
  }
  return vars;
}

export const BUILT_IN_VARS: { name: string; hint: string }[] = [
  { name: 'SHOOT_DAYS', hint: 'Shoot days on the stripboard (or the version’s shoot days)' },
  { name: 'SHOOT_WEEKS', hint: 'Shoot days ÷ 5, rounded up' },
  { name: 'CAST', hint: 'Characters in the Day Out of Days' },
  { name: 'CREW', hint: 'People on the crew list' },
  { name: 'LOCATIONS', hint: 'Locations' },
  { name: 'SCENES', hint: 'Scenes in the script' },
  { name: 'PAGES', hint: 'Script pages' },
  { name: 'PERSON_DAYS', hint: 'People on set × shoot days' },
];

export interface BudgetView {
  facts: BreakdownFacts;
  /** Base lines with linked quantities (before version changes). */
  base: BudgetLine[];
  /** Final lines for the chosen version. */
  lines: BudgetLine[];
  orphaned: Set<string>;
  vars: Vars;
}

export function budgetView(p: Project, d: Derived, scenarioId?: string, facts?: BreakdownFacts): BudgetView {
  const f = facts ?? breakdownFacts(p, d);
  const { lines: base, orphaned } = resolveLines(p, f);
  const sc = p.budget.scenarios.find((s) => s.id === scenarioId);
  const vars = budgetVars(p, d, f, sc?.shootDays ?? f.shootDays);
  const lines = finalizeLines(scenarioLines(p.budget, base, sc?.id), vars);
  return { facts: f, base, lines, orphaned, vars };
}
