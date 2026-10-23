import type { Draft } from 'immer';
import type { BudgetLine, BudgetUnits, DealTerms, PaperDoc, PaperKind, PaperStatus, PersonRef, Project, ShootDay, UnionStatus } from '../model/types';
import type { Derived } from '../script/derive';
import { newId } from '../model/ids';
import { crewAccount } from '../budget/fromBreakdown';
import { resolveCallSheet } from '../schedule/callsheet';
import { fillTemplate, templateFor } from './templates';
import { isUnion } from './unions';

// Paperwork for cast and crew: deal memos (their rate goes into the person's budget line),
// releases signed in the app, and start forms. Open Gate records that a form was received and
// where it's kept, never its contents: no SSNs, tax IDs, bank details or member numbers.

export const PAPER_KINDS: { id: PaperKind; label: string; group: 'Deal' | 'Release' | 'Start form'; hint?: string }[] = [
  { id: 'deal', label: 'Deal memo', group: 'Deal' },
  { id: 'crew', label: 'Crew agreement', group: 'Release' },
  { id: 'talent', label: 'Talent release', group: 'Release' },
  { id: 'appearance', label: 'Appearance release (extras)', group: 'Release' },
  { id: 'location', label: 'Location release', group: 'Release' },
  { id: 'nda', label: 'NDA', group: 'Release' },
  { id: 'minor', label: 'Minor work permit', group: 'Release', hint: 'Issued by the state or country; attach the permit and its expiry date' },
  { id: 'w9', label: 'W-9 (US contractor)', group: 'Start form', hint: 'Record only that it was received and where it is kept' },
  { id: 'w4', label: 'W-4 (US employee)', group: 'Start form', hint: 'Record only that it was received and where it is kept' },
  { id: 'i9', label: 'I-9 (US employee)', group: 'Start form', hint: 'Record only that it was received and where it is kept' },
  { id: 'other', label: 'Other document', group: 'Release' },
];
export const paperLabel = (k: PaperKind) => PAPER_KINDS.find((x) => x.id === k)?.label ?? k;
export const isForm = (k: PaperKind) => k === 'w9' || k === 'w4' || k === 'i9';
/** Kinds the signature pad can sign in the app. */
export const signable = (k: PaperKind) => !isForm(k) && k !== 'minor';

export const PAPER_STATUSES: { id: PaperStatus; label: string }[] = [
  { id: 'draft', label: 'Draft' }, { id: 'sent', label: 'Sent' }, { id: 'signed', label: 'Signed' },
  { id: 'received', label: 'Received' }, { id: 'na', label: 'Not needed' },
];
export const statusesFor = (k: PaperKind) => PAPER_STATUSES.filter((s) => (isForm(k) ? s.id !== 'signed' && s.id !== 'sent' : s.id !== 'received'));
/** Done = nothing more to collect. */
export const isDone = (d: PaperDoc) => d.status === 'signed' || d.status === 'received' || d.status === 'na';

// ---------- people ----------

export interface Person {
  ref: PersonRef;
  key: string;
  name: string;
  role: string;
  group: 'Cast' | 'Crew' | 'Contact' | 'Location';
  union?: string;
  unionStatus?: UnionStatus;
  unionLocal?: string;
  societies?: string[];
  pgaCertified?: boolean;
  email?: string;
}

export const refKey = (r: PersonRef) => `${r.kind}:${r.id}`;

/** Everyone paperwork can be for: cast, crew, then other contacts and locations. */
export function people(p: Project, opts: { contacts?: boolean; locations?: boolean } = {}): Person[] {
  const out: Person[] = [
    ...[...p.cast].sort((a, b) => a.castNumber - b.castNumber).map((c) => ({ ref: { kind: 'cast' as const, id: c.id }, name: c.actorName || `(${c.characterName})`, role: `#${c.castNumber} ${c.characterName}`, group: 'Cast' as const, union: c.union, unionStatus: c.unionStatus, unionLocal: c.unionLocal, societies: c.societies, pgaCertified: c.pgaCertified, email: c.email })),
    ...p.crew.map((c) => ({ ref: { kind: 'crew' as const, id: c.id }, name: c.name || '(unnamed)', role: c.role, group: 'Crew' as const, union: c.union, unionStatus: c.unionStatus, unionLocal: c.unionLocal, societies: c.societies, pgaCertified: c.pgaCertified })),
  ].map((x) => ({ ...x, key: refKey(x.ref) }));
  if (opts.contacts) out.push(...p.contacts.map((c) => ({ ref: { kind: 'contact' as const, id: c.id }, key: `contact:${c.id}`, name: c.name || '(unnamed)', role: c.role || c.company, group: 'Contact' as const, union: c.union, unionStatus: c.unionStatus, unionLocal: c.unionLocal, email: c.email })));
  if (opts.locations) out.push(...p.locations.map((l) => ({ ref: { kind: 'location' as const, id: l.id }, key: `location:${l.id}`, name: l.realName || l.setName, role: l.contactName ? `Owner: ${l.contactName}` : l.address, group: 'Location' as const })));
  return out;
}

export function personOf(p: Project, r: PersonRef): Person | undefined {
  return people(p, { contacts: r.kind === 'contact', locations: r.kind === 'location' }).find((x) => x.ref.kind === r.kind && x.ref.id === r.id);
}

export const docsFor = (p: Project, r: PersonRef) => (p.budget.paperwork ?? []).filter((x) => x.person.kind === r.kind && x.person.id === r.id);

/** The paperwork a person is expected to have: a deal memo and a release; start forms once you track them. */
export function expectedKinds(person: Person, docs: PaperDoc[]): PaperKind[] {
  if (person.group === 'Location') return ['location'];
  if (person.group === 'Contact') return [];
  const out: PaperKind[] = ['deal', person.group === 'Cast' ? 'talent' : 'crew'];
  const deal = docs.find((d) => d.kind === 'deal')?.deal;
  if (docs.some((d) => isForm(d.kind)) || deal) out.push(...(deal?.contractor ? ['w9' as const] : ['w4' as const, 'i9' as const]));
  return out;
}

/** What's still missing for a person (expected kinds with no finished document). */
export function missingFor(p: Project, person: Person): PaperKind[] {
  const docs = docsFor(p, person.ref);
  return expectedKinds(person, docs).filter((k) => !docs.some((d) => d.kind === k && isDone(d)));
}

// ---------- new documents ----------

export function newDoc(p: Project, kind: PaperKind, person: PersonRef): PaperDoc {
  const who = personOf(p, person);
  const title = `${paperLabel(kind)}${who ? ` — ${who.name}` : ''}`;
  const tpl = templateFor(p, kind);
  const doc: PaperDoc = { id: newId(), kind, person, title, status: 'draft', updated: new Date().toISOString() };
  // Releases keep the text they were made with; a deal memo's text is filled from its terms when printed.
  if (tpl && kind !== 'deal') doc.body = fillTemplate(tpl, p, who);
  if (kind === 'deal') doc.deal = { rate: 0, per: 'day' };
  return doc;
}

// ---------- budget ----------

const UNIT_FOR: Record<DealTerms['per'], BudgetUnits> = { day: 'days', week: 'weeks', flat: 'flat' };
const linkKindOf = (r: PersonRef) => (r.kind === 'cast' ? 'cast' : r.kind === 'crew' ? 'crew' : null);

/**
 * Deal memos into the budget: each memo's rate goes into that person's linked cast / crew line
 * (created if it isn't there yet), a kit fee becomes its own linked line, and union people's lines
 * get the budget's union pension & health fringe ticked.
 */
export function syncPaperworkLines(d: Draft<Project>) {
  const docs = d.budget.paperwork ?? [];
  const deals = docs.filter((x) => x.kind === 'deal' && x.deal && x.status !== 'na');
  const accountId = (code: string) => d.budget.accounts.find((a) => a.code === code)?.id ?? d.budget.accounts.find((a) => a.group === 'btl')?.id ?? d.budget.accounts[0]?.id;
  const nameOf = (r: PersonRef) => {
    if (r.kind === 'cast') { const c = d.cast.find((x) => x.id === r.id); return c ? (c.actorName ? `${c.characterName} (${c.actorName})` : c.characterName) : ''; }
    const c = d.crew.find((x) => x.id === r.id);
    return c ? [c.role, c.name].filter(Boolean).join(' — ') : '';
  };
  const codeFor = (r: PersonRef) => (r.kind === 'cast' ? '1400' : crewAccount(d.crew.find((x) => x.id === r.id)?.role ?? ''));

  for (const doc of deals) {
    const kind = linkKindOf(doc.person);
    const t = doc.deal!;
    if (!kind) continue;
    if (t.rate > 0) {
      let line = d.budget.lines.find((l) => l.link?.kind === kind && l.link.id === doc.person.id);
      if (!line && (kind === 'cast' ? d.cast : d.crew).some((x) => x.id === doc.person.id)) {
        line = { id: newId(), accountId: accountId(codeFor(doc.person))!, description: nameOf(doc.person) || 'Deal', qty: 1, units: 'days', x: 1, rate: 0, fringeIds: [], link: { kind, id: doc.person.id, auto: true } } as BudgetLine;
        d.budget.lines.push(line);
      }
      if (line) {
        line.rate = t.rate;
        const was = line.units;
        line.units = UNIT_FOR[t.per];
        // Day rates follow the schedule; weekly and flat deals are counted by hand.
        if (t.per === 'flat') { line.link!.auto = false; line.qty = 1; }
        else if (t.per === 'week') { line.link!.auto = false; if (was !== 'weeks') line.qty = Math.max(1, Math.ceil((t.guaranteedDays || 5) / 5)); }
        else line.link!.auto = true;
      }
    }
  }
  // Kit fee lines: one per deal with a kit fee, removed when the fee or the memo goes.
  const kitDeals = new Map(deals.filter((x) => (x.deal!.kitFee ?? 0) > 0 && linkKindOf(x.person)).map((x) => [x.id, x]));
  d.budget.lines = d.budget.lines.filter((l) => l.link?.kind !== 'kit' || kitDeals.has(l.link.id ?? ''));
  for (const doc of kitDeals.values()) {
    const t = doc.deal!;
    const want = { description: `Kit fee — ${nameOf(doc.person) || 'deal memo'}`, units: UNIT_FOR[t.kitPer ?? 'day'], rate: t.kitFee! };
    const line = d.budget.lines.find((l) => l.link?.kind === 'kit' && l.link.id === doc.id);
    if (line) Object.assign(line, want);
    else d.budget.lines.push({ id: newId(), accountId: accountId(codeFor(doc.person))!, qty: 1, x: 1, fringeIds: [], ...want, link: { kind: 'kit', id: doc.id, auto: true } } as BudgetLine);
  }
  // Union people: tick the union fringe on their lines (only adds; your own choices stay).
  const fringe = d.budget.fringes.find((f) => /union|pension|p\s*&\s*h|health/i.test(f.name));
  if (fringe) {
    const unionIds = new Set([...d.cast.filter(isUnion).map((c) => c.id), ...d.crew.filter(isUnion).map((c) => c.id)]);
    for (const l of d.budget.lines) {
      const id = l.link?.kind === 'cast' || l.link?.kind === 'castHold' || l.link?.kind === 'crew' ? l.link.id : undefined;
      if (id && unionIds.has(id) && !l.fringeIds.includes(fringe.id)) l.fringeIds.push(fringe.id);
    }
  }
}

/** Warnings about deals: guaranteed days above the schedule. */
export function dealWarnings(p: Project, workDays: (r: PersonRef) => number): { docId: string; text: string }[] {
  const out: { docId: string; text: string }[] = [];
  for (const doc of p.budget.paperwork ?? []) {
    const g = doc.deal?.guaranteedDays ?? 0;
    if (doc.kind !== 'deal' || !g) continue;
    const days = workDays(doc.person);
    if (days < g) out.push({ docId: doc.id, text: `${personOf(p, doc.person)?.name ?? 'Someone'} is guaranteed ${g} days but scheduled for ${days}: the budget line still counts ${days}.` });
  }
  return out;
}

// ---------- shoot days ----------

/** Cast and crew on a day's call sheet. */
export function dayPeople(p: Project, d: Derived, day: ShootDay): PersonRef[] {
  const r = resolveCallSheet(p, d, day);
  const out: PersonRef[] = [];
  for (const c of r.cast) {
    if (!c.inToday) continue;
    const m = p.cast.find((x) => x.characterName.trim().toUpperCase() === c.characterName.trim().toUpperCase());
    if (m) out.push({ kind: 'cast', id: m.id });
  }
  for (const c of r.crew) {
    const m = c.crewId ? p.crew.find((x) => x.id === c.crewId) : p.crew.find((x) => x.name && x.name === c.name);
    if (m && !out.some((x) => x.kind === 'crew' && x.id === m.id)) out.push({ kind: 'crew', id: m.id });
  }
  return out;
}

/** People on a day's call sheet without a signed release (cast) or crew agreement (crew). */
export function unsignedOnDay(p: Project, d: Derived, day: ShootDay): Person[] {
  return dayPeople(p, d, day).map((r) => personOf(p, r)).filter((x): x is Person => !!x)
    .filter((x) => !docsFor(p, x.ref).some((doc) => (doc.kind === 'talent' || doc.kind === 'crew' || doc.kind === 'appearance' || doc.kind === 'minor') && isDone(doc)));
}

/** Union / non-union head counts per shoot day. */
export function unionCounts(p: Project, d: Derived): { day: ShootDay; union: number; nonUnion: number }[] {
  return p.schedule.days.filter((x) => x.items.some((i) => i.kind === 'scene')).map((day) => {
    const ppl = dayPeople(p, d, day).map((r) => personOf(p, r)).filter((x): x is Person => !!x);
    const union = ppl.filter((x) => isUnion(x)).length;
    return { day, union, nonUnion: ppl.length - union };
  });
}
