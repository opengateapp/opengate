import type { Project, SocietyOption } from '../model/types';

// Honorary societies: letters after a name in the credits ("Jane Doe, ASC"). Not unions: they set
// no pay or rules. Letters appear only for people you tick, never guessed. Styles as each society
// uses them where we could confirm it (ACE dropped its periods in 2014); the rest use the plain
// form and can be changed in Settings → Unions & Societies.

export const SOCIETIES: SocietyOption[] = [
  { id: 'asc', abbr: 'ASC', name: 'American Society of Cinematographers', craft: 'Cinematographers', letters: 'ASC' },
  { id: 'bsc', abbr: 'BSC', name: 'British Society of Cinematographers', craft: 'Cinematographers', letters: 'BSC' },
  { id: 'csc', abbr: 'CSC', name: 'Canadian Society of Cinematographers', craft: 'Cinematographers', letters: 'CSC' },
  { id: 'acs', abbr: 'ACS', name: 'Australian Cinematographers Society', craft: 'Cinematographers', letters: 'ACS' },
  { id: 'nzcs', abbr: 'NZCS', name: 'New Zealand Cinematographers Society', craft: 'Cinematographers', letters: 'NZCS' },
  { id: 'afc', abbr: 'AFC', name: 'Association Française des directeurs de la photographie Cinématographique', craft: 'Cinematographers', letters: 'AFC' },
  { id: 'bvk', abbr: 'BVK', name: 'Berufsverband Kinematografie', craft: 'Cinematographers', letters: 'BVK' },
  { id: 'aic', abbr: 'AIC', name: 'Associazione Italiana Autori della Fotografia Cinematografica', craft: 'Cinematographers', letters: 'AIC' },
  { id: 'aec', abbr: 'AEC', name: 'Asociación Española de Autores de Obras Fotográficas Cinematográficas', craft: 'Cinematographers', letters: 'AEC' },
  { id: 'soc', abbr: 'SOC', name: 'Society of Camera Operators', craft: 'Camera operators', letters: 'SOC' },
  { id: 'gbct', abbr: 'GBCT', name: 'Guild of British Camera Technicians', craft: 'Camera crew', letters: 'GBCT' },
  { id: 'ace', abbr: 'ACE', name: 'American Cinema Editors', craft: 'Editors', letters: 'ACE' },
  { id: 'cce', abbr: 'CCE', name: 'Canadian Cinema Editors', craft: 'Editors', letters: 'CCE' },
  { id: 'cas', abbr: 'CAS', name: 'Cinema Audio Society', craft: 'Sound mixers', letters: 'CAS' },
  { id: 'amps', abbr: 'AMPS', name: 'Association of Motion Picture Sound', craft: 'Sound', letters: 'AMPS' },
  { id: 'mpse', abbr: 'MPSE', name: 'Motion Picture Sound Editors', craft: 'Sound editors', letters: 'MPSE' },
  { id: 'csa', abbr: 'CSA', name: 'Casting Society', craft: 'Casting', letters: 'CSA' },
  { id: 'lmgi', abbr: 'LMGI', name: 'Location Managers Guild International', craft: 'Locations', letters: 'LMGI' },
  { id: 'ves', abbr: 'VES', name: 'Visual Effects Society', craft: 'Visual effects', letters: 'VES' },
  { id: 'csi', abbr: 'CSI', name: 'Colorist Society International', craft: 'Colorists', letters: 'CSI' },
  { id: 'pga', abbr: 'PGA', name: 'Producers Guild of America (the p.g.a. mark)', craft: 'Producers', letters: 'p.g.a.' },
];

export function societyOptions(p: Project, includeHidden = false): SocietyOption[] {
  const list = p.societyOptions?.length ? p.societyOptions : SOCIETIES;
  return includeHidden ? list : list.filter((s) => !s.hidden);
}

export interface Societied { societies?: string[]; pgaCertified?: boolean }

/** The letters for a person, in list order: "ASC", "ACE", "p.g.a." (only when certified for this production). */
export function societyLetters(p: Project, x: Societied): string[] {
  if (!x.societies?.length) return [];
  const all = societyOptions(p, true);
  return x.societies.map((id) => all.find((s) => s.id === id))
    .filter((s): s is SocietyOption => !!s && (s.id !== 'pga' || !!x.pgaCertified))
    .map((s) => s.letters.trim()).filter(Boolean);
}

/** "Jane Doe, ASC, BSC" — the name with its letters. */
export function withLetters(p: Project, name: string, x?: Societied): string {
  const l = x ? societyLetters(p, x) : [];
  return l.length ? `${name}, ${l.join(', ')}` : name;
}

/** Find the cast or crew record for a name typed elsewhere (production info), to add their letters. */
export function personByName(p: Project, name: string): Societied | undefined {
  const n = name.trim().toLowerCase();
  if (!n) return undefined;
  return p.crew.find((c) => c.name.trim().toLowerCase() === n) ?? p.cast.find((c) => c.actorName.trim().toLowerCase() === n) ?? p.contacts.find((c) => c.name.trim().toLowerCase() === n);
}
