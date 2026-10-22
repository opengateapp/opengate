import type { Draft } from 'immer';
import type { Clearance, ClearanceKind, ClearanceStatus, Project } from '../model/types';
import type { Derived } from '../script/derive';
import { newId } from '../model/ids';
import { csv } from '../io/reports';

// The script clearance report: things in the script that may need permission or a check before
// the film goes out (E&O insurers ask for this). The scan only suggests; a person decides.

export const CLEARANCE_KINDS: { id: ClearanceKind; label: string }[] = [
  { id: 'location', label: 'Location' }, { id: 'artwork', label: 'Artwork / poster' }, { id: 'logo', label: 'Brand / logo' },
  { id: 'name', label: 'Name (real person?)' }, { id: 'phone', label: 'Phone number' }, { id: 'address', label: 'Address' },
  { id: 'web', label: 'Website / email' }, { id: 'archival', label: 'Archival footage' }, { id: 'minor', label: 'Minor' },
  { id: 'music', label: 'Music' }, { id: 'other', label: 'Other' },
];
export const clearanceLabel = (k: ClearanceKind) => CLEARANCE_KINDS.find((x) => x.id === k)?.label ?? k;

export const CLEARANCE_STATUSES: { id: ClearanceStatus; label: string }[] = [
  { id: 'needed', label: 'Needed' }, { id: 'requested', label: 'Requested' }, { id: 'cleared', label: 'Cleared' },
  { id: 'replace', label: 'Replace / change' }, { id: 'na', label: 'Not needed' },
];

/** Common brands a script tends to name (a starter list; anything tagged as a prop is checked too). */
const BRANDS = [
  'Coca-Cola', 'Coke', 'Pepsi', 'Sprite', 'Red Bull', 'Starbucks', "McDonald's", 'Burger King', 'Wendy\'s', 'KFC', 'Subway', 'Taco Bell', 'Domino\'s', 'Pizza Hut',
  'Budweiser', 'Heineken', 'Corona', 'Jack Daniel\'s', 'Marlboro', 'Apple', 'iPhone', 'iPad', 'MacBook', 'Samsung', 'Google', 'Facebook', 'Instagram', 'TikTok',
  'YouTube', 'Twitter', 'Netflix', 'Amazon', 'Uber', 'Lyft', 'Tesla', 'Ford', 'Chevy', 'Chevrolet', 'Toyota', 'Honda', 'BMW', 'Mercedes', 'Porsche', 'Ferrari',
  'Jeep', 'Harley', 'Nike', 'Adidas', 'Gucci', 'Louis Vuitton', 'Rolex', 'Walmart', 'Target', 'Costco', '7-Eleven', 'Disney', 'Marvel', 'Lego', 'Barbie',
  'Xbox', 'PlayStation', 'Nintendo', 'Polaroid', 'Kodak', 'Sony', 'Canon', 'Tylenol', 'Advil', 'Band-Aid', 'Kleenex', 'Post-it', 'Sharpie', 'Zippo', 'Ray-Ban',
];
const ESC = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BRAND_RE = new RegExp(`\\b(${BRANDS.map(ESC).join('|')})\\b`, 'gi');
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b|\b\d{3}[\s.-]\d{4}\b/g;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s]+|\b[\w-]+\.(?:com|net|org|io|co)\b/gi;
const ADDRESS_RE = /\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct|Place|Pl)\b\.?/g;
/** Props, wardrobe, vehicles, set dressing and the like: anything tagged here may carry a brand. */
const CHECK_CATEGORIES = new Set(['props', 'vehicles', 'wardrobe', 'setDressing', 'misc']);

export interface ScanHit { kind: ClearanceKind; item: string; sceneIds: string[]; why: string }

/** What in the script might need clearing, merged by item (a name in five scenes is one row). */
export function scanScript(p: Project, d: Derived): ScanHit[] {
  const hits = new Map<string, ScanHit>();
  const add = (kind: ClearanceKind, item: string, sceneId: string | undefined, why: string) => {
    const k = `${kind}:${item.trim().toLowerCase()}`;
    const h = hits.get(k) ?? { kind, item: item.trim(), sceneIds: [], why };
    if (sceneId && !h.sceneIds.includes(sceneId)) h.sceneIds.push(sceneId);
    hits.set(k, h);
  };
  let scene: string | undefined;
  let idx = -1;
  for (const b of d.blocks) {
    if (b.type === 'sceneHeading') { idx++; scene = d.scenes[idx]?.id; continue; }
    if (b.type === 'character' || b.type === 'transition') continue;
    const t = b.text;
    for (const m of t.matchAll(PHONE_RE)) add('phone', m[0], scene, 'Use a 555-01xx number, or clear the real one');
    for (const m of t.matchAll(EMAIL_RE)) add('web', m[0], scene, 'Real email addresses reach real people');
    for (const m of t.replace(EMAIL_RE, '').matchAll(URL_RE)) add('web', m[0].replace(/[.,;:!?)]+$/, ''), scene, 'A real website or domain');
    for (const m of t.matchAll(ADDRESS_RE)) add('address', m[0].replace(/\.$/, ''), scene, 'A street address that may exist');
    for (const m of t.matchAll(BRAND_RE)) add('logo', canonicalBrand(m[0]), scene, 'Brand named in the script');
  }
  // Characters with a first and last name might match a real person in the story's setting.
  for (const c of d.characters) {
    if (/^[A-Z][A-Z'’-]+ [A-Z][A-Z'’-]+$/.test(c.name) && !/^(MR|MRS|MS|MISS|DR|SIR|LADY|LORD|OFFICER|DETECTIVE|AGENT|SHERIFF|DEPUTY|CAPTAIN|SERGEANT|SGT|LIEUTENANT|COLONEL|GENERAL|PRIVATE|NURSE|DOCTOR|COACH|JUDGE|MAYOR|PROFESSOR|PRINCIPAL|FATHER|MOTHER|AUNT|UNCLE|GRANDMA|GRANDPA|KING|QUEEN|PRINCE|PRINCESS|THE|YOUNG|OLD|LITTLE|BIG)\b/.test(c.name)
      && !/\b(MAN|WOMAN|GIRL|BOY|GUY|KID|LADY|COP|GUARD|DRIVER|WAITER|WAITRESS|CLERK|VOICE|CROWD|#?\d+)$/.test(c.name)) {
      for (const id of c.sceneIds) add('name', titleCase(c.name), id, 'Full name: check no real person with this name fits the story');
    }
  }
  // Tagged props, vehicles, wardrobe and set dressing.
  for (const e of p.elements) {
    if (!CHECK_CATEGORIES.has(e.categoryId)) continue;
    const scenes = [...new Set([...e.sceneIds, ...d.scenes.filter((s) => s.taggedElementIds.includes(e.id)).map((s) => s.id)])];
    if (BRAND_RE.test(e.name)) { BRAND_RE.lastIndex = 0; for (const id of scenes) add('logo', e.name, id, 'Tagged element names a brand'); }
    else if (/poster|painting|artwork|photo|sign|logo|label|magazine|book|newspaper|t-shirt|tee|mural|billboard/i.test(e.name)) {
      for (const id of scenes) add('artwork', e.name, id, 'Artwork, signage or printed matter seen on camera');
    }
    BRAND_RE.lastIndex = 0;
  }
  return [...hits.values()];
}

function canonicalBrand(s: string): string {
  return BRANDS.find((b) => b.toLowerCase() === s.toLowerCase()) ?? s;
}
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s'-])(\w)/g, (_, a: string, b: string) => a + b.toUpperCase());

/** Adds scan hits to the clearances log (skips ones already there); returns how many were added. */
export function applyScan(dr: Draft<Project>, hits: ScanHit[]): number {
  dr.budget.clearances ??= [];
  let n = 0;
  for (const h of hits) {
    const have = dr.budget.clearances.find((c) => c.kind === h.kind && c.item.trim().toLowerCase() === h.item.toLowerCase());
    if (have) { for (const id of h.sceneIds) if (!have.sceneIds.includes(id)) have.sceneIds.push(id); continue; }
    dr.budget.clearances.push({ id: newId(), kind: h.kind, item: h.item, sceneIds: [...h.sceneIds], status: 'needed', source: 'scan', notes: h.why });
    n++;
  }
  return n;
}

export function newClearance(kind: ClearanceKind = 'other'): Clearance {
  return { id: newId(), kind, item: '', sceneIds: [], status: 'needed', source: 'manual' };
}

/** The clearance report: the log plus licenses, with scene numbers. */
export function clearanceReportRows(p: Project, d: Derived): string[][] {
  const sc = (ids: string[]) => ids.map((id) => d.sceneById.get(id)?.number ?? '?').join(', ');
  const st = (s: ClearanceStatus) => CLEARANCE_STATUSES.find((x) => x.id === s)?.label ?? s;
  return [
    ...(p.budget.clearances ?? []).map((c) => [clearanceLabel(c.kind), c.item, sc(c.sceneIds), st(c.status), c.source === 'scan' ? 'Script scan' : 'Added', c.notes ?? '']),
    ...(p.budget.licenses ?? []).map((l) => ['License: ' + l.kind, l.title, sc(l.sceneIds), l.status, 'Budget → Licenses', l.licenseNumber ? `License # ${l.licenseNumber}` : '']),
  ];
}

export function clearanceReportCsv(p: Project, d: Derived): string {
  return csv([['Kind', 'Item', 'Scenes', 'Status', 'Source', 'Notes'], ...clearanceReportRows(p, d)]);
}
