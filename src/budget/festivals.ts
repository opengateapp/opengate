import type { Draft } from 'immer';
import type { BudgetLine, Festival, FestivalCost, FestivalDeadline, FestivalInfo, FestivalStatus, FestivalTier, PremiereRule, Project } from '../model/types';
import { newId } from '../model/ids';
import { addDays, diffDays, todayISO } from '../model/dates';
import { parseCsv } from './expenses';

// Budget → Festivals: the festivals you're aiming at, their deadlines and fees, and where each
// submission stands. Festivals are typed or pasted in by you: FilmFreeway's terms forbid scraping
// and its API is for festivals only, so Open Gate never fetches festival pages. Planned fees and
// travel become linked lines in Festivals & Marketing (5100).

export const FESTIVAL_STATUSES: { id: FestivalStatus; label: string }[] = [
  { id: 'considering', label: 'Considering' }, { id: 'planned', label: 'Planned' }, { id: 'submitted', label: 'Submitted' },
  { id: 'accepted', label: 'Accepted' }, { id: 'declined', label: 'Not selected' }, { id: 'withdrawn', label: 'Withdrawn' },
];
export const FESTIVAL_TIERS: { id: FestivalTier; label: string }[] = [
  { id: 'top', label: 'Top tier' }, { id: 'target', label: 'Target' }, { id: 'local', label: 'Local / regional' }, { id: 'long-shot', label: 'Long shot' },
];
export const PREMIERE_RULES: { id: PremiereRule; label: string; rank: number }[] = [
  { id: 'none', label: 'No premiere needed', rank: 0 }, { id: 'regional', label: 'Regional premiere', rank: 1 },
  { id: 'national', label: 'National premiere', rank: 2 }, { id: 'north-american', label: 'North American premiere', rank: 3 },
  { id: 'international', label: 'International premiere', rank: 4 }, { id: 'world', label: 'World premiere', rank: 5 },
];

export const newFestival = (patch: Partial<Festival> = {}): Festival => ({ id: newId(), name: '', platform: 'filmfreeway', tier: 'target', status: 'considering', deadlines: [], ...patch });
export const newDeadline = (label = 'Regular', date = '', fee = 0): FestivalDeadline => ({ id: newId(), label, date, fee });

/** Festivals that count toward the budget: you're entering or have entered them. */
export const budgeted = (f: Festival) => f.status === 'planned' || f.status === 'submitted' || f.status === 'accepted';

const sorted = (f: Festival) => [...f.deadlines].filter((d) => d.date).sort((a, b) => a.date.localeCompare(b.date));

/** The next deadline still open (today counts), or undefined when they've all passed. */
export function nextDeadline(f: Festival, today = todayISO()): FestivalDeadline | undefined {
  return sorted(f).find((d) => d.date >= today);
}

/** What entering costs: the fee you paid, or the fee at your aimed deadline (or the next open one). Waived is $0. */
export function aimedFee(f: Festival, today = todayISO()): number {
  if (f.feePaid != null && (f.status === 'submitted' || f.status === 'accepted' || f.status === 'declined')) return f.feePaid;
  if (f.waiver?.trim()) return 0;
  const d = f.deadlines.find((x) => x.id === f.aim) ?? nextDeadline(f, today) ?? sorted(f).slice(-1)[0];
  return d?.fee ?? 0;
}

export interface FestivalTotals { planned: number; paid: number; travel: number; byStatus: Record<FestivalStatus, number>; upcoming: { festival: Festival; deadline: FestivalDeadline; days: number }[] }

export function festivalTotals(list: Festival[], today = todayISO()): FestivalTotals {
  const byStatus = Object.fromEntries(FESTIVAL_STATUSES.map((s) => [s.id, 0])) as Record<FestivalStatus, number>;
  let planned = 0, paid = 0, travel = 0;
  const upcoming: FestivalTotals['upcoming'] = [];
  for (const f of list) {
    byStatus[f.status]++;
    if (budgeted(f)) planned += aimedFee(f, today);
    if (f.feePaid) paid += f.feePaid;
    if (f.attend && budgeted(f)) travel += f.travel ?? 0;
    if (f.status === 'considering' || f.status === 'planned') {
      const d = nextDeadline(f, today);
      if (d) upcoming.push({ festival: f, deadline: d, days: diffDays(today, d.date) });
    }
  }
  upcoming.sort((a, b) => a.days - b.days);
  return { planned, paid, travel, byStatus, upcoming };
}

/**
 * Premiere clashes: a festival that wants a (world, national…) premiere, when another festival you
 * plan to enter screens before it. Festivals usually reject films that have already screened.
 */
export function premiereWarnings(list: Festival[]): { festival: Festival; before: Festival }[] {
  const out: { festival: Festival; before: Festival }[] = [];
  const live = list.filter((f) => budgeted(f) && f.eventStart);
  for (const f of live) {
    // World and international premieres are lost by any earlier screening. National and regional
    // ones depend on where the earlier festival is, which we can't judge: no warning for those.
    const rank = PREMIERE_RULES.find((r) => r.id === (f.premiere ?? 'none'))!.rank;
    if (rank < 4) continue;
    const earlier = live.filter((g) => g.id !== f.id && g.eventStart! < f.eventStart!).sort((a, b) => a.eventStart!.localeCompare(b.eventStart!));
    if (earlier.length) out.push({ festival: f, before: earlier[0] });
  }
  return out;
}

// ---------------------------------------------------------------- the list and its money

// Release → Festivals is shared: the list (Project.festivals) syncs on the release channel, and
// each festival's money (fees, waiver, paid, travel) stays in the budget (budget.festivalCosts).
// The app works on the joined Festival. Lists saved before Release (budget.festivals) are still
// read, and moved over the first time someone with the budget edits festivals.

type HasFestivals = Pick<Project, 'festivals' | 'budget'>;

const costOfLegacy = (f: Festival): FestivalCost => ({ id: f.id, fees: Object.fromEntries(f.deadlines.map((d) => [d.id, d.fee])), waiver: f.waiver, feePaid: f.feePaid, travel: f.travel });

/** A festival without its money. */
export function festivalInfo(f: Festival): FestivalInfo {
  const { waiver: _w, feePaid: _p, travel: _t, deadlines, ...rest } = f;
  return { ...rest, deadlines: deadlines.map(({ fee: _f, ...d }) => d) };
}

/** A festival's money, or undefined when there isn't any. */
export function festivalCost(f: Festival): FestivalCost | undefined {
  const fees = Object.fromEntries(f.deadlines.filter((d) => d.fee).map((d) => [d.id, d.fee]));
  if (!Object.keys(fees).length && !f.waiver && f.feePaid == null && !f.travel) return undefined;
  const c: FestivalCost = { id: f.id, fees };
  if (f.waiver) c.waiver = f.waiver;
  if (f.feePaid != null) c.feePaid = f.feePaid;
  if (f.travel) c.travel = f.travel;
  return c;
}

/** The list with its money (fees are 0 for people who can't see the budget). */
export function joinFestivals(p: HasFestivals): Festival[] {
  const legacy = (p.budget.festivals ?? []) as Festival[];
  const legacyById = new Map(legacy.map((f) => [f.id, f]));
  const costs = new Map((p.budget.festivalCosts ?? []).map((c) => [c.id, c]));
  const out: Festival[] = ((p.festivals ?? []) as FestivalInfo[]).map((f) => {
    const old = legacyById.get(f.id);
    const c = costs.get(f.id) ?? (old ? costOfLegacy(old) : undefined);
    const j: Festival = { ...f, deadlines: f.deadlines.map((d) => ({ ...d, fee: c?.fees[d.id] ?? 0 })) };
    if (c?.waiver) j.waiver = c.waiver;
    if (c?.feePaid != null) j.feePaid = c.feePaid;
    if (c?.travel) j.travel = c.travel;
    return j;
  });
  const have = new Set(out.map((f) => f.id));
  for (const f of legacy) if (!have.has(f.id)) out.push(f);
  return out;
}

/**
 * Writes the edited list back. With the budget (`money`), its money goes to festivalCosts, the
 * old copy is retired and the budget's festival lines follow; without it, money is left as it is.
 */
export function writeFestivals(dr: Draft<Project>, list: Festival[], money: boolean) {
  dr.festivals = list.map(festivalInfo);
  if (!money) return;
  dr.budget.festivalCosts = list.map(festivalCost).filter((c): c is FestivalCost => !!c);
  dr.budget.festivals = [];
  syncFestivalLines(dr);
}

/** Moves a saved project's old list over (projects that aren't shared; shared rooms move on the first budget edit). */
export function moveLegacyFestivals(p: Project) {
  if (!p.budget.festivals?.length) return;
  const list = joinFestivals(p);
  p.festivals = list.map(festivalInfo);
  p.budget = { ...p.budget, festivalCosts: list.map(festivalCost).filter((c): c is FestivalCost => !!c), festivals: [] };
}

/** The budget's festival lines' items, worked out from the shared list (so Release-only edits show up). */
export function festivalLineItems(p: HasFestivals, kind: 'festival' | 'festivalTravel', today = todayISO()): { id: string; description: string; qty: number; rate: number }[] {
  const list = joinFestivals(p).filter(budgeted);
  return kind === 'festival'
    ? list.map((f) => ({ id: `fest-${f.id}`, description: `${f.name || 'Festival'}${f.status === 'submitted' || f.status === 'accepted' ? ' (entered)' : ''}`, qty: 1, rate: aimedFee(f, today) }))
    : list.filter((f) => f.attend).map((f) => ({ id: `travel-${f.id}`, description: f.name || 'Festival', qty: 1, rate: f.travel ?? 0 }));
}

/** Whether the budget is missing its festival lines (someone without the budget added the first festivals). */
export function needsFestivalLines(p: HasFestivals): boolean {
  const list = joinFestivals(p);
  const has = (k: string) => p.budget.lines.some((l) => l.link?.kind === k);
  return (list.length > 0 && !has('festival')) || (list.length === 0 && has('festival')) || (list.some((f) => budgeted(f) && f.attend) && !has('festivalTravel'));
}

// ---------------------------------------------------------------- budget lines

/** Keeps "Festival submissions" and "Festival travel" lines in 5100 in step with the list. */
export function syncFestivalLines(d: Draft<Project>, today = todayISO()) {
  const list = joinFestivals(d as unknown as Project);
  const acc = d.budget.accounts.find((a) => a.code === '5100') ?? d.budget.accounts.find((a) => a.group === 'other') ?? d.budget.accounts[0];
  const upsert = (kind: 'festival' | 'festivalTravel', description: string, items: { description: string; rate: number }[]) => {
    let line = d.budget.lines.find((l) => l.link?.kind === kind);
    if (!list.length) { if (line) d.budget.lines = d.budget.lines.filter((l) => l !== line); return; }
    if (!line) {
      // Take over a plain line of the same name from the marketing block, so it isn't counted twice.
      line = d.budget.lines.find((l) => !l.link && l.description.trim().toLowerCase() === description.toLowerCase());
      if (!line) { line = { id: newId(), accountId: acc.id, description, qty: 1, units: 'flat', x: 1, rate: 0, fringeIds: [] } as BudgetLine; d.budget.lines.push(line); }
    }
    Object.assign(line, { description, qty: 1, units: 'flat', x: 1, link: { kind, auto: true }, notes: 'From Release → Festivals.' });
    line.items = items.map((it) => ({ id: newId(), description: it.description, qty: 1, rate: it.rate }));
  };
  upsert('festival', 'Festival submissions', list.filter(budgeted).map((f) => ({ description: `${f.name || 'Festival'}${f.status === 'submitted' || f.status === 'accepted' ? ' (entered)' : ''}`, rate: aimedFee(f, today) })));
  upsert('festivalTravel', 'Festival travel', list.filter((f) => budgeted(f) && f.attend).map((f) => ({ description: f.name || 'Festival', rate: f.travel ?? 0 })));
}

// ---------------------------------------------------------------- paste and CSV

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Dates in a line (as ISO), in order. A date without a year takes the next one on or after `today`. */
export function datesIn(text: string, today = todayISO()): string[] {
  const out: { at: number; date: string }[] = [];
  const yearFor = (m: number, d: number) => { const y = Number(today.slice(0, 4)); return iso(y, m, d) >= today ? y : y + 1; };
  let m: RegExpExecArray | null;
  // 2027-05-30
  const isoRe = /\b(20\d\d)-(\d\d)-(\d\d)\b/g;
  while ((m = isoRe.exec(text))) out.push({ at: m.index, date: iso(+m[1], +m[2], +m[3]) });
  // 05/30/2027 (US order)
  const usRe = /\b(\d{1,2})\/(\d{1,2})\/(20\d\d)\b/g;
  while ((m = usRe.exec(text))) out.push({ at: m.index, date: iso(+m[3], +m[1], +m[2]) });
  const spans: [number, number][] = [];
  // September 10 - 14, 2026 / March 1, 2027 / Mar 1 / March 1st 2027
  const mdRe = new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?(?:\\s*[-–]\\s*(?:${MONTH_RE}\\.?\\s+)?(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?)?(?:,?\\s*(20\\d\\d))?`, 'gi');
  while ((m = mdRe.exec(text))) {
    const mon = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    const mon2 = m[3] ? MONTHS.indexOf(m[3].slice(0, 3).toLowerCase()) + 1 : mon;
    const y = m[5] ? +m[5] : yearFor(mon, +m[2]);
    out.push({ at: m.index, date: iso(y, mon, +m[2]) });
    if (m[4]) out.push({ at: m.index + 1, date: iso(y, mon2, +m[4]) });
    spans.push([m.index, m.index + m[0].length]);
  }
  // 1 March 2027 / 10 Sept 2026
  const dmRe = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}\\.?(?:,?\\s*(20\\d\\d))?`, 'gi');
  while ((m = dmRe.exec(text))) {
    const a = m.index, b = m.index + m[0].length;
    if (spans.some(([x, y]) => a < y && x < b)) continue;
    const mon = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    out.push({ at: m.index, date: iso(m[3] ? +m[3] : yearFor(mon, +m[1]), mon, +m[1]) });
  }
  return out.sort((a, b) => a.at - b.at).map((o) => o.date);
}

/** Money amounts in a line: "$25", "USD $35", "US$13.50", "€20", "£15". */
export function amountsIn(text: string): number[] {
  return [...text.matchAll(/(?:US\$|USD\s*\$?|\$|€|£|EUR\s*|GBP\s*|CAD\s*\$?|AUD\s*\$?)\s?(\d+(?:[.,]\d{1,2})?)/gi)].map((m) => Number(m[1].replace(',', '.')));
}

const DEADLINE_RE = /\b(early ?bird|earlybird|early|regular|standard|late|final|extended|extension|super early|last chance)\b[^:\n$€£]*?(deadline)?/i;
const EVENT_RE = /\b(event|festival)\s*dates?\b/i;
const NOTIFY_RE = /\bnotification\b/i;
const OPENING_RE = /\bopening date\b|\bsubmissions open\b|\bcall for entries opens?\b/i;
const HEADING_RE = /^(dates?\s*(&|and)\s*deadlines?|categories?\s*(&|and)\s*fees|fees|deadlines|about|rules|terms|awards|submit now|submit|share|follow)$/i;
const titleCase = (s: string) => s.replace(/\b(early ?bird)\b/i, 'Earlybird').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+deadline$/i, '').trim();

export interface PasteResult { festival: Festival; guessed: string[]; note?: string }

/**
 * Reads the dates-and-fees text a person copied from a festival's FilmFreeway page or website.
 * Labels and their dates may share a line ("Late Deadline: May 30, 2027") or sit on consecutive
 * lines (FilmFreeway's layout). Fees are matched to deadline labels; the first category wins.
 */
export function parseFestivalPaste(text: string, today = todayISO()): PasteResult {
  // One deadline per line: festival sites often put several in a sentence ("Early: … Late: …").
  const LABELS = /\b(?:super early|early ?bird|early|regular|standard|late|final|extended|extension|last chance)\b/gi;
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).flatMap((l) => {
    const at = [...l.matchAll(LABELS)].map((m) => m.index!).filter((i, k, all) => k === 0 || i - all[k - 1] > 12);
    if (at.length < 2) return [l];
    return [l.slice(0, at[0]), ...at.map((i, k) => l.slice(i, at[k + 1]))].map((x) => x.trim()).filter(Boolean);
  });
  const guessed: string[] = [];
  const f = newFestival({ status: 'considering' });
  const url = text.match(/https?:\/\/[^\s)]+/)?.[0];
  if (url) { f.url = url; f.platform = /filmfreeway\.com/i.test(url) ? 'filmfreeway' : 'site'; }
  const dateAt = (i: number) => datesIn(lines[i], today)[0] ?? (lines[i + 1] && !DEADLINE_RE.test(lines[i + 1]) ? datesIn(lines[i + 1], today)[0] : undefined);
  const deadlines = new Map<string, FestivalDeadline>();
  let category: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (EVENT_RE.test(l)) {
      const ds = datesIn(l, today).length ? datesIn(l, today) : datesIn(lines[i + 1] ?? '', today);
      if (ds[0]) { f.eventStart = ds[0]; f.eventEnd = ds[1] ?? ds[0]; }
      continue;
    }
    if (NOTIFY_RE.test(l)) { const d = dateAt(i); if (d) f.notifyDate = d; continue; }
    if (OPENING_RE.test(l)) continue;
    const dl = l.match(DEADLINE_RE);
    if (dl) {
      const label = titleCase(dl[1]);
      const fees = amountsIn(l);
      const date = datesIn(l, today)[0] ?? (fees.length ? undefined : dateAt(i));
      const cur = deadlines.get(label.toLowerCase()) ?? newDeadline(label, '', 0);
      if (date && !cur.date) cur.date = date;
      if (fees.length && !cur.fee) { cur.fee = fees[0]; if (fees.length > 1) guessed.push(`${label} fee (a range: ${fees.join(' – ')})`); }
      deadlines.set(label.toLowerCase(), cur);
      continue;
    }
    // A category heading right before the first fee line ("Narrative Short").
    if (!category && l.length <= 50 && !/submission|open|deadline|[!?]/i.test(l) && !amountsIn(l).length && !datesIn(l, today).length && lines[i + 1] && DEADLINE_RE.test(lines[i + 1]) && amountsIn(lines[i + 1]).length) category = l;
  }
  f.deadlines = [...deadlines.values()].filter((d) => d.date || d.fee).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
  if (category) f.category = category;
  // The name: the first line that isn't a heading, a label, a date or a price.
  const name = lines.find((l) => !HEADING_RE.test(l) && !DEADLINE_RE.test(l) && !EVENT_RE.test(l) && !NOTIFY_RE.test(l) && !OPENING_RE.test(l)
    && !datesIn(l, today).length && !amountsIn(l).length && !/^https?:/i.test(l) && l !== category && l.length <= 80);
  if (name) { f.name = name; guessed.push('Festival name'); }
  if (f.deadlines.some((d) => !d.fee)) guessed.push('Some fees (not found)');
  if (f.deadlines.some((d) => !d.date)) guessed.push('Some deadline dates (not found)');
  const open = f.deadlines.find((d) => d.date >= today);
  if (open) f.aim = open.id;
  const note = !f.deadlines.length ? 'No deadlines found. Copy the "Dates & Deadlines" and fees part of the page and try again, or type them in.' : undefined;
  return { festival: f, guessed, note };
}

/** A spreadsheet of festivals: Name, URL, Deadline (label), Date, Fee, Event start, Event end, Location. Header row optional. */
export function parseFestivalCsv(text: string, today = todayISO()): Festival[] {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim()));
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const hasHead = head.some((h) => /name|festival|deadline|fee/.test(h));
  const col = (re: RegExp, fallback: number) => { const i = head.findIndex((h) => re.test(h)); return hasHead ? i : fallback; };
  const c = { name: col(/name|festival/, 0), url: col(/url|link|website/, 1), label: col(/deadline|label|round/, 2), date: col(/^date|deadline date|due/, 3), fee: col(/fee|cost|price/, 4), start: col(/event|start|festival date/, 5), end: col(/end/, 6), loc: col(/location|city|where/, 7) };
  const byName = new Map<string, Festival>();
  for (const r of rows.slice(hasHead ? 1 : 0)) {
    const get = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : '');
    const name = get(c.name);
    if (!name) continue;
    const f = byName.get(name.toLowerCase()) ?? newFestival({ name, status: 'considering' });
    const url = get(c.url); if (url) { f.url = url; f.platform = /filmfreeway\.com/i.test(url) ? 'filmfreeway' : 'site'; }
    const loc = get(c.loc); if (loc) f.location = loc;
    const start = datesIn(get(c.start), today)[0]; if (start) { f.eventStart = start; f.eventEnd = datesIn(get(c.end), today)[0] ?? start; }
    const date = datesIn(get(c.date), today)[0] ?? datesIn(get(c.label), today)[0];
    const fee = amountsIn(get(c.fee))[0] ?? (Number(get(c.fee).replace(/[^\d.]/g, '')) || 0);
    if (date || fee) f.deadlines.push(newDeadline(titleCase(get(c.label).replace(/\d.*$/, '').trim()) || 'Deadline', date ?? '', fee));
    byName.set(name.toLowerCase(), f);
  }
  return [...byName.values()].map((f) => ({ ...f, aim: f.deadlines.find((d) => d.date >= today)?.id }));
}

/** Days from today to a date (negative when past). */
export const daysUntil = (date: string, today = todayISO()) => diffDays(today, date);
export const soon = (date: string, today = todayISO()) => date >= today && date <= addDays(today, 14);

/** Calendar entries by date: deadlines of festivals you're considering or planning, and festival and notification dates. */
export function festivalDates(list: Festival[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const put = (date: string | undefined, text: string) => { if (date) out.set(date, [...(out.get(date) ?? []), text]); };
  for (const f of list) {
    const name = f.name || 'Festival';
    if (f.status === 'considering' || f.status === 'planned') for (const d of f.deadlines) put(d.date, `${name}: ${d.label} deadline`);
    if (f.status !== 'declined' && f.status !== 'withdrawn') put(f.eventStart, `${name} begins`);
    if (f.status === 'submitted') put(f.notifyDate, `${name}: notification`);
  }
  return out;
}
