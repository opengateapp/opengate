import type { CreditStyle, CreditsSettings, Project } from '../model/types';
import type { Derived } from '../script/derive';
import { creditLine, kindLabel } from '../budget/licenses';
import { newId } from '../model/ids';

// End credits, assembled live from the project: opening cards, cast, crew by department, music,
// footage, locations, vendors, thanks and legal lines. Settings only hold the arrangement
// (order, headings, styles, what's hidden, your own blocks), so names stay up to date.

export interface CreditLine { key: string; role?: string; name: string }
export interface CreditBlock { id: string; heading: string; style: CreditStyle; lines: CreditLine[]; auto: boolean; hidden: boolean }

/** Departments in end-credit order, with the words that place a crew role in them (most specific first). */
export const DEPARTMENTS: { id: string; heading: string; match: RegExp }[] = [
  { id: 'casting', heading: 'Casting', match: /\bcasting\b/ },
  { id: 'stunts', heading: 'Stunts', match: /stunt|fight (co|chor)/ },
  { id: 'transport', heading: 'Transportation', match: /transport|driver|teamster/ },
  { id: 'catering', heading: 'Catering & Craft Services', match: /catering|craft serv|\bchef\b|cook/ },
  { id: 'camera', heading: 'Camera Department', match: /director of photography|cinematograph|\bd\.?o\.?p\b|\bdp\b|camera|\b(1st|2nd|first|second)?\s*a\.?c\.?\b|focus pull|clapper|loader|\bdit\b|digital imaging|data wrang|steadicam|gimbal|drone/ },
  { id: 'art', heading: 'Art Department', match: /production design|art direct|\bart\b|set decor|set dress|props?\b|prop master|construction|carpent|scenic|graphic/ },
  { id: 'electric', heading: 'Electrical Department', match: /gaffer|best boy electric|electric|lamp op|genny|generator|lighting/ },
  { id: 'grip', heading: 'Grip Department', match: /\bgrip|dolly/ },
  { id: 'wardrobe', heading: 'Wardrobe', match: /costume|wardrobe/ },
  { id: 'hmu', heading: 'Hair & Makeup', match: /make-?up|\bmua\b|\bhair\b|prosthetic|sfx make/ },
  { id: 'post', heading: 'Post-Production', match: /editor|editorial|colou?rist|colou?r grad|sound design|re-?recording|foley|\bvfx\b|visual effect|post[- ]prod|online|conform/ },
  { id: 'sound', heading: 'Sound Department', match: /sound|boom|audio|mixer/ },
  { id: 'music', heading: 'Music', match: /composer|music/ },
  { id: 'locations', heading: 'Locations', match: /location/ },
  { id: 'direction', heading: 'Direction', match: /assistant director|\b(1st|2nd|first|second|2nd 2nd)\s*a\.?d\.?\b|\bad\b|script supervisor|continuity|director/ },
  { id: 'producing', heading: 'Production', match: /producer|production manager|\bupm\b|coordinator|production assistant|\bp\.?a\.?\b|accountant|runner|office|line producer|production/ },
  { id: 'other', heading: 'Additional Crew', match: /.*/ },
];

export function departmentOf(role: string): string {
  const r = role.toLowerCase();
  return (DEPARTMENTS.find((d) => d.match.test(r)) ?? DEPARTMENTS[DEPARTMENTS.length - 1]).id;
}

/** Order departments appear in the roll. */
const DEPT_ORDER = ['producing', 'direction', 'casting', 'camera', 'grip', 'electric', 'art', 'wardrobe', 'hmu', 'sound', 'locations', 'stunts', 'transport', 'catering', 'music', 'post', 'other'];

export function defaultCredits(): CreditsSettings {
  return { order: [], headings: {}, styles: {}, hiddenBlocks: [], hiddenLines: [], custom: [], thanks: '', legal: {}, castOrder: 'number', secondsPerScreen: 8 };
}
export const creditsOf = (p: Pick<Project, 'credits'>): CreditsSettings => ({ ...defaultCredits(), ...p.credits });

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** Every block, automatic and custom, in the saved order (new ones in their natural place), with settings applied. */
export function buildCredits(p: Project, d: Derived, opts: { includeLicenses?: boolean } = {}): CreditBlock[] {
  const c = creditsOf(p);
  const auto: { id: string; heading: string; style: CreditStyle; lines: CreditLine[] }[] = [];
  const title = p.titlePage.title || p.title;

  // Opening cards
  const cards: CreditLine[] = [];
  if (p.production.company) cards.push({ key: 'company', role: 'A production of', name: p.production.company });
  if (title) cards.push({ key: 'title', name: title.toUpperCase() });
  if (p.production.director) cards.push({ key: 'director', role: 'Directed by', name: p.production.director });
  if (p.titlePage.author) cards.push({ key: 'writer', role: p.titlePage.credit || 'Written by', name: p.titlePage.author });
  if (p.production.producer) cards.push({ key: 'producer', role: 'Produced by', name: p.production.producer });
  auto.push({ id: 'cards', heading: '', style: 'card', lines: cards });

  // Cast
  const firstScene = new Map<string, number>();
  d.scenes.forEach((s, i) => s.characters.forEach((n) => { if (!firstScene.has(n)) firstScene.set(n, i); }));
  const cast = p.cast.filter((m) => m.characterName || m.actorName).slice().sort((a, b) =>
    c.castOrder === 'alpha' ? (a.actorName || a.characterName).localeCompare(b.actorName || b.characterName)
      : c.castOrder === 'appearance' ? (firstScene.get(a.characterName) ?? 1e9) - (firstScene.get(b.characterName) ?? 1e9) || a.castNumber - b.castNumber
        : a.castNumber - b.castNumber);
  auto.push({ id: 'cast', heading: 'Cast', style: 'columns', lines: cast.map((m) => ({ key: m.id, role: titleCase(m.characterName), name: m.actorName || '(to be cast)' })) });

  // Crew by department (crew list plus crew contacts not already on it)
  const seen = new Set<string>();
  const crew: { id: string; name: string; role: string }[] = [];
  for (const m of p.crew) if (m.name.trim()) { crew.push(m); seen.add(m.name.trim().toLowerCase()); }
  for (const m of p.contacts) if (m.kind === 'crew' && m.name.trim() && !seen.has(m.name.trim().toLowerCase())) crew.push({ id: m.id, name: m.name, role: m.role });
  const byDept = new Map<string, CreditLine[]>();
  for (const m of crew) {
    const dept = departmentOf(m.role || '');
    byDept.set(dept, [...(byDept.get(dept) ?? []), { key: m.id, role: m.role || '', name: m.name }]);
  }
  for (const id of DEPT_ORDER) {
    const lines = byDept.get(id);
    if (lines?.length) auto.push({ id: `crew-${id}`, heading: DEPARTMENTS.find((x) => x.id === id)!.heading, style: 'columns', lines });
  }

  // Licenses (only when the budget is visible to this person)
  if (opts.includeLicenses !== false) {
    const lic = (p.budget.licenses ?? []).filter((l) => l.inCredits && l.status !== 'declined');
    const music = lic.filter((l) => l.kind === 'music');
    if (music.length) auto.push({ id: 'music', heading: 'Music', style: 'centered', lines: music.map((l) => ({ key: l.id, name: creditLine(l) })) });
    const footage = lic.filter((l) => l.kind === 'stock' || l.kind === 'archival' || l.kind === 'photo');
    if (footage.length) auto.push({ id: 'footage', heading: 'Footage & Images', style: 'centered', lines: footage.map((l) => ({ key: l.id, name: creditLine(l) })) });
    const other = lic.filter((l) => l.kind === 'font' || l.kind === 'software' || l.kind === 'other');
    if (other.length) auto.push({ id: 'licensed', heading: 'Additional Licenses', style: 'centered', lines: other.map((l) => ({ key: l.id, role: kindLabel(l.kind), name: creditLine(l) })) });
  }

  // Locations, vendors, thanks, legal
  const locs = p.locations.filter((l) => l.realName || l.setName);
  if (locs.length) auto.push({ id: 'locations', heading: 'Filmed on Location at', style: 'names', lines: locs.map((l) => ({ key: l.id, name: l.realName || titleCase(l.setName) })) });
  const vendors = p.contacts.filter((x) => x.kind === 'vendor' && (x.company || x.name));
  if (vendors.length) auto.push({ id: 'vendors', heading: 'Equipment & Services', style: 'columns', lines: vendors.map((v) => ({ key: v.id, role: v.role || 'Provided by', name: v.company || v.name })) });
  const thanks = c.thanks.split('\n').map((x) => x.trim()).filter(Boolean);
  if (thanks.length) auto.push({ id: 'thanks', heading: 'Special Thanks', style: 'names', lines: thanks.map((t, i) => ({ key: `t${i}-${slug(t)}`, name: t })) });
  const year = new Date().getFullYear();
  const legal: CreditLine[] = [];
  if (c.legal.fiction) legal.push({ key: 'fiction', name: 'This is a work of fiction. Any resemblance to actual persons, living or dead, or actual events is purely coincidental.' });
  if (c.legal.animals) legal.push({ key: 'animals', name: 'No animals were harmed in the making of this film.' });
  legal.push({ key: 'copyright', name: c.copyright?.trim() || `© ${year} ${p.production.company || title}. All rights reserved.` });
  if (c.legal.openGate) legal.push({ key: 'opengate', name: 'Made with Open Gate' });
  auto.push({ id: 'legal', heading: '', style: 'names', lines: legal });

  // Custom blocks, then order.
  const all = [
    ...auto.map((b) => ({ ...b, auto: true })),
    ...c.custom.map((b) => ({ id: b.id, heading: b.heading, style: b.style, auto: false, lines: b.lines.map((l, i) => ({ key: `c${i}`, ...l })) })),
  ];
  const natural = all.map((b) => b.id);
  // Saved order first; blocks that appeared since slot in after the block before them naturally.
  const result: string[] = [];
  for (const id of c.order) if (natural.includes(id)) result.push(id);
  for (const id of natural) {
    if (result.includes(id)) continue;
    const before = natural[natural.indexOf(id) - 1];
    const at = before ? result.indexOf(before) : -1;
    if (id === 'legal') result.push(id); else result.splice(at + 1, 0, id);
  }
  const order = c.order.length ? result : natural;
  return order.map((id) => all.find((b) => b.id === id)!).map((b) => ({
    ...b,
    heading: c.headings[b.id] ?? b.heading,
    style: c.styles[b.id] ?? b.style,
    hidden: c.hiddenBlocks.includes(b.id),
    lines: b.lines.filter((l) => !c.hiddenLines.includes(`${b.id}|${l.key}`)),
  }));
}

export const visibleBlocks = (blocks: CreditBlock[]) => blocks.filter((b) => !b.hidden && b.lines.length);

/** Number of text lines the roll takes (for runtime and layout). */
export function rollLines(blocks: CreditBlock[]): number {
  let n = 0;
  for (const b of visibleBlocks(blocks)) {
    n += b.heading ? 2 : 0;
    for (const l of b.lines) n += b.style === 'card' ? 6 : b.style === 'centered' ? l.name.split('\n').length + (l.role ? 1 : 0) + 1 : 1;
    n += 2;
  }
  return n;
}

/** Suggested runtime: about 20 lines per screen at the chosen speed (rounded to whole seconds, at least 20). */
export function suggestedRuntime(blocks: CreditBlock[], secondsPerScreen: number): number {
  return Math.max(20, Math.round((rollLines(blocks) / 20) * secondsPerScreen));
}

/** Missing info worth fixing before the credits go out. */
export function creditWarnings(p: Project): string[] {
  const out: string[] = [];
  const noActor = p.cast.filter((m) => m.characterName && !m.actorName).map((m) => m.characterName);
  if (noActor.length) out.push(`No actor yet for ${noActor.slice(0, 5).join(', ')}${noActor.length > 5 ? ` and ${noActor.length - 5} more` : ''}.`);
  const noRole = p.crew.filter((m) => m.name && !m.role).map((m) => m.name);
  if (noRole.length) out.push(`Crew without a role (they go under Additional Crew): ${noRole.slice(0, 5).join(', ')}.`);
  if (!p.production.director) out.push('No director in Settings → Production.');
  for (const l of p.budget.licenses ?? []) {
    if (l.inCredits && l.status !== 'licensed' && l.status !== 'declined') out.push(`“${l.title || kindLabel(l.kind)}” is in the credits but not licensed yet.`);
    if (l.inCredits && !creditLine(l)) out.push(`“${l.title || kindLabel(l.kind)}” has no credit line.`);
  }
  return out;
}

/** "SHERIFF DALE" → "Sheriff Dale" (character names are stored in capitals). */
export function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s'’(-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());
}

export const newCustomBlock = (heading = 'New section'): CreditsSettings['custom'][number] => ({ id: `custom-${newId()}`, heading, style: 'columns', lines: [] });
