import type { Project } from '../model/types';
import { SCHEMA_VERSION, newProject } from '../model/defaults';

/** Upgrades older saved projects and fills fields added since they were written. */
export function migrate(input: unknown): Project {
  const p = input as Partial<Project>;
  const base = newProject(p.title ?? 'Untitled');
  const out: Project = {
    ...base,
    ...p,
    production: { ...base.production, ...p.production },
    titlePage: { ...base.titlePage, ...p.titlePage },
    schedule: { ...base.schedule, ...p.schedule, colors: { ...p.schedule?.colors } },
    schemaVersion: SCHEMA_VERSION,
  } as Project;
  out.categories = p.categories?.length ? p.categories : base.categories;
  // v2: call sheets and storyboard frames
  out.callSheets = p.callSheets && typeof p.callSheets === 'object' ? p.callSheets : {};
  out.storyboard = Array.isArray(p.storyboard) ? p.storyboard : [];
  // v3: plan, docs, A/V scripts, boards
  for (const k of ['contacts', 'tasks', 'docs', 'avScripts', 'boards'] as const) {
    (out as unknown as Record<string, unknown>)[k] = Array.isArray(p[k]) ? p[k] : [];
  }
  // v4: budget
  const b = p.budget as Partial<Project['budget']> | undefined;
  out.budget = b && typeof b === 'object'
    ? { ...base.budget, ...b, accounts: b.accounts?.length ? b.accounts : base.budget.accounts, lines: b.lines ?? [], fringes: b.fringes ?? base.budget.fringes, scenarios: b.scenarios ?? [], expenses: b.expenses ?? [] }
    : base.budget;
  return out;
}
