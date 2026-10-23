import type { CastMember, Project, UnionOption, UnionStatus } from '../model/types';
import { newId } from '../model/ids';
import { societyLetters } from './societies';

// Unions and guilds for cast and crew. We keep names (and a link to the union's own pages) only:
// never rate sheets, and never member ID numbers.

export const UNIONS: UnionOption[] = [
  { id: 'sag-aftra', name: 'SAG-AFTRA', group: 'US performers' },
  { id: 'iatse', name: 'IATSE', group: 'US crew', locals: ['600 (camera)', '700 (editors)', '695 (sound)', '728 (electric)', '80 (grips)', '44 (props)', '706 (makeup & hair)', '705 (costume)', '800 (art directors)', '871 (script supervisors)', '52 (studio mechanics, New York)', '161 (script supervisors & coordinators, East Coast)', '476 (studio mechanics, Chicago)'] },
  { id: 'teamsters', name: 'Teamsters', group: 'US crew', locals: ['399 (Hollywood: drivers, casting, locations)', '817 (New York: drivers, casting, locations)'] },
  { id: 'tag', name: 'The Animation Guild', group: 'US crew', locals: ['839'] },
  { id: 'cdg', name: 'Costume Designers Guild', group: 'US crew', locals: ['892'] },
  { id: 'dga', name: 'DGA', group: 'US above the line' },
  { id: 'wga', name: 'WGA', group: 'US above the line' },
  { id: 'afm', name: 'AFM', group: 'US above the line' },
  { id: 'actra', name: 'ACTRA', group: 'Canada' },
  { id: 'dgc', name: 'DGC', group: 'Canada' },
  { id: 'iatse-ca', name: 'IATSE Canada', group: 'Canada', locals: ['667 (camera, Toronto)', '669 (camera, Western Canada)'] },
  { id: 'equity-uk', name: 'Equity (UK)', group: 'UK' },
  { id: 'bectu', name: 'BECTU', group: 'UK' },
  { id: 'directors-uk', name: 'Directors UK', group: 'UK' },
  { id: 'wggb', name: 'WGGB', group: 'UK' },
  { id: 'meaa', name: 'MEAA', group: 'Australia' },
  { id: 'equity-nz', name: 'Equity NZ', group: 'New Zealand' },
];

/** SAG-AFTRA agreements an indie usually works under. Names only; check sagaftra.org for limits and rates. */
/** Names as on SAG-AFTRA's low budget contracts one-sheet (checked October 2026). */
export const SAG_TIERS = ['Micro-Budget Project', 'Student Film', 'Short Project (SPA)', 'Ultra Low Project (UPA)', 'Moderate Low (MPA)', 'Low Budget (LBA)', 'Vertical Agreement', 'New Media (Deferrable)', 'Special New Media A', 'Special New Media B', 'Special New Media C', 'Special New Media D', 'Theatrical Basic Agreement'];
export const SAG_LINK = 'https://www.sagaftra.org/production-center';

export const UNION_STATUSES: { id: UnionStatus; label: string; short: string }[] = [
  { id: 'nonunion', label: 'Non-union', short: 'Non-union' },
  { id: 'member', label: 'Member', short: '' },
  { id: 'ficore', label: 'Financial core', short: 'Fi-core' },
  { id: 'taft-hartley', label: 'Taft-Hartley (eligible to join)', short: 'T-H' },
  { id: 'pending', label: 'Pending', short: 'pending' },
];

/** The union list for this project (Settings → Unions), hidden ones left out unless asked. */
export function unionOptions(p: Project, includeHidden = false): UnionOption[] {
  const list = p.unionOptions?.length ? p.unionOptions : UNIONS;
  return includeHidden ? list : list.filter((u) => !u.hidden);
}

export interface Unioned { union?: string; unionStatus?: UnionStatus; unionLocal?: string }

/** True when this person counts as union for this show. */
export const isUnion = (x: Unioned) => !!x.union && x.unionStatus !== 'nonunion';

/** A short badge: "SAG-AFTRA", "IATSE 600", "SAG-AFTRA · T-H". Empty when non-union. */
export function unionBadge(x: Unioned): string {
  if (!x.union || x.unionStatus === 'nonunion') return '';
  const local = x.unionLocal?.match(/^\s*(\d+)/)?.[1] ?? x.unionLocal?.trim();
  const st = UNION_STATUSES.find((s) => s.id === x.unionStatus)?.short;
  return [x.union + (local ? ` ${local}` : ''), st].filter(Boolean).join(' · ');
}

/** Is the production on a SAG-AFTRA agreement? */
export const sagShow = (p: Project) => (p.production.agreement?.union ?? '').toUpperCase().startsWith('SAG');

/** Cast who'd need a Taft-Hartley report: non-union performers on a SAG-AFTRA show. */
export function taftHartleyNeeded(p: Project): { id: string; name: string }[] {
  if (!sagShow(p)) return [];
  return p.cast.filter((c) => c.actorName.trim() && (!c.union || c.unionStatus === 'nonunion')).map((c) => ({ id: c.id, name: c.actorName }));
}

/** A new cast member, starting on the production's union agreement (status pending) when there is one. */
export function newCastMember(p: Project, castNumber: number, characterName = 'NEW CHARACTER'): CastMember {
  const u = p.production.agreement?.union;
  return { id: newId(), castNumber, characterName, actorName: '', unavailable: [], ...(u ? { union: u, unionStatus: 'pending' as const } : {}) };
}

/** Union badge for a call-sheet cast row (matched by character) or crew row (by crew id, then name). */
export function castBadge(p: Project, characterName: string): string {
  const m = p.cast.find((c) => c.characterName.trim().toUpperCase() === characterName.trim().toUpperCase());
  return m ? [unionBadge(m), ...societyLetters(p, m)].filter(Boolean).join(' · ') : '';
}
export function crewBadge(p: Project, crewId: string | undefined, name: string): string {
  const m = (crewId && p.crew.find((c) => c.id === crewId)) || (name.trim() ? p.crew.find((c) => c.name === name) : undefined);
  return m ? [unionBadge(m), ...societyLetters(p, m)].filter(Boolean).join(' · ') : '';
}
