import { create } from 'zustand';
import type { Alignment, CharacterOptions, CharacterProfile, DerivedScene, Project } from '../model/types';
import type { Derived } from './derive';
import { sceneCast } from './derive';
import { newId } from '../model/ids';

// Character profiles: a stripped-down D&D-style sheet per character, matched to the script
// (and to cast) by the character's name.

export const ALIGNMENTS: { id: Alignment; label: string }[] = [
  { id: 'LG', label: 'Lawful Good' }, { id: 'NG', label: 'Neutral Good' }, { id: 'CG', label: 'Chaotic Good' },
  { id: 'LN', label: 'Lawful Neutral' }, { id: 'NN', label: 'True Neutral' }, { id: 'CN', label: 'Chaotic Neutral' },
  { id: 'LE', label: 'Lawful Evil' }, { id: 'NE', label: 'Neutral Evil' }, { id: 'CE', label: 'Chaotic Evil' },
];
export const alignmentLabel = (a?: Alignment) => ALIGNMENTS.find((x) => x.id === a)?.label ?? '';

export const SPECIES_PACKS: { id: string; label: string; items: string[] }[] = [
  { id: 'contemporary', label: 'Contemporary / real world', items: ['Human'] },
  { id: 'fantasy', label: 'Fantasy', items: ['Elf', 'Dwarf', 'Halfling', 'Orc', 'Goblin', 'Giant', 'Fairy', 'Dragon'] },
  { id: 'scifi', label: 'Science fiction', items: ['Android', 'Robot', 'Cyborg', 'AI', 'Clone', 'Alien', 'Mutant'] },
  { id: 'horror', label: 'Horror / supernatural', items: ['Vampire', 'Werewolf', 'Ghost', 'Spirit', 'Zombie', 'Demon', 'Witch'] },
  { id: 'creature', label: 'Animals & creatures', items: ['Animal', 'Talking animal', 'Creature', 'Puppet'] },
];

export const ARCHETYPES = ['Innocent', 'Everyman', 'Hero', 'Caregiver', 'Explorer', 'Rebel', 'Lover', 'Creator', 'Jester', 'Sage', 'Magician', 'Ruler'];

export const ARCS = ['Positive change', 'Flat / steadfast', 'Disillusionment', 'Fall', 'Corruption', 'Redemption', 'Moral ascent', 'Moral descent', 'Testing'];

export const ROLES = ['Protagonist', 'Antagonist', 'Deuteragonist', 'Supporting', 'Mentor', 'Love interest', 'Foil', 'Comic relief', 'Sidekick', 'Minor', 'Extra'];
export const RACES = ['Human', 'Elf', 'Dwarf', 'Halfling', 'Orc', 'Android', 'Alien', 'Creature', 'Spirit', 'Vampire', 'Werewolf', 'Robot'];
export const GENDERS = ['Female', 'Male', 'Non-binary', 'Unknown'];

export interface ProfileField { k: string; label: string; long?: boolean }

/** The profile template's sections (core fields — race, gender, role, alignment — live in the header). */
export const PROFILE_SECTIONS: { id: string; title: string; fields: ProfileField[] }[] = [
  { id: 'basic', title: 'Basic Info', fields: [
    { k: 'fullName', label: 'Full name' }, { k: 'nickname', label: 'Nickname' }, { k: 'age', label: 'Age' }, { k: 'dob', label: 'Date of birth' },
    { k: 'orientation', label: 'Sexual orientation' }, { k: 'nationality', label: 'Nationality / culture' }, { k: 'residence', label: 'Current residence' },
  ] },
  { id: 'physical', title: 'Physical Appearance', fields: [
    { k: 'height', label: 'Height' }, { k: 'weight', label: 'Weight' }, { k: 'hair', label: 'Hair color' }, { k: 'eyes', label: 'Eye color' },
    { k: 'skin', label: 'Skin color' }, { k: 'props', label: 'Significant props', long: true }, { k: 'costume', label: 'Significant costume', long: true },
  ] },
  { id: 'personality', title: 'Personality', fields: [
    { k: 'speech', label: 'Speech / accent' }, { k: 'identity', label: 'Identity traits' }, { k: 'behavior', label: 'Behavioral traits', long: true },
  ] },
  { id: 'psyche', title: 'Inner Psyche', fields: [
    { k: 'psych', label: 'Psychological state' }, { k: 'goals', label: 'Ambitions / goals' }, { k: 'hopesFears', label: 'Hopes / fears' },
    { k: 'spiritual', label: 'Religious / spiritual' }, { k: 'emotions', label: 'Private emotions', long: true },
  ] },
  { id: 'additional', title: 'Additional Details', fields: [
    { k: 'family', label: 'Family / friends' }, { k: 'career', label: 'Career / work' }, { k: 'living', label: 'Living environment' },
    { k: 'past', label: 'Memories / past', long: true }, { k: 'notes', label: 'Other notes', long: true },
  ] },
];

export const TRAIT_LISTS = [
  { k: 'strengths', label: 'Strengths', hint: 'e.g. Quick-witted, loyal' },
  { k: 'weaknesses', label: 'Weaknesses', hint: 'e.g. Can’t swim, bad knee' },
  { k: 'faults', label: 'Faults / flaws', hint: 'e.g. Reckless, jealous' },
  { k: 'actions', label: 'Actions', hint: 'Signature moves and habits' },
] as const;

export function defaultCharacterOptions(): CharacterOptions {
  return {
    roles: [...ROLES], genders: [...GENDERS], speciesPacks: ['contemporary'], customSpecies: [], speciesLabel: 'Species',
    compass: 'alignment', archetypes: [...ARCHETYPES], hiddenFields: [], customFields: [],
  };
}

/** The project's Character Builder choices, with defaults for anything not set. */
export function characterOptions(p: Pick<Project, 'characterOptions'>): CharacterOptions & { species: string[]; speciesNotes: Record<string, string> } {
  const o = { ...defaultCharacterOptions(), ...p.characterOptions };
  const custom = (o.customPacks ?? []).filter((x) => o.speciesPacks.includes(x.id)).flatMap((x) => x.entries.map((e) => e.name));
  const species = [...new Set([...SPECIES_PACKS.filter((x) => o.speciesPacks.includes(x.id)).flatMap((x) => x.items), ...custom, ...o.customSpecies])];
  const speciesNotes: Record<string, string> = {};
  for (const pk of (o.customPacks ?? []).filter((x) => o.speciesPacks.includes(x.id))) for (const e of pk.entries) if (e.note && !speciesNotes[e.name]) speciesNotes[e.name] = e.note;
  return { ...o, species, speciesNotes };
}

/** Profile sections with hidden fields removed and the project's own fields added. */
export function profileSections(o: CharacterOptions): { id: string; title: string; fields: ProfileField[] }[] {
  return PROFILE_SECTIONS.map((sec) => ({
    ...sec,
    fields: [
      ...sec.fields.filter((f) => !o.hiddenFields.includes(f.k)),
      ...o.customFields.filter((f) => f.section === sec.id).map((f) => ({ k: `custom:${f.id}`, label: f.label, long: f.long })),
    ],
  })).filter((sec) => sec.fields.length);
}

export const normName = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase();

export function newProfile(name: string): CharacterProfile {
  return { id: newId(), name: normName(name), race: '', gender: '', role: '', strengths: [], weaknesses: [], faults: [], actions: [], info: {}, continuity: [] };
}

/** Scenes the character is in (speaking, or added as non-speaking cast in the breakdown). */
export function scenesFor(p: Project, d: Derived, name: string): DerivedScene[] {
  const n = normName(name);
  return d.scenes.filter((s) => sceneCast(p, s).includes(n));
}

export interface CharacterEntry { name: string; profile?: CharacterProfile; scenes: number; lines: number; actor?: string; castNumber?: number }

/** Profiles first, then script characters and cast without one yet. */
export function characterEntries(p: Project, d: Derived): CharacterEntry[] {
  const lines = new Map(d.characters.map((c) => [c.name, c.lines]));
  const castBy = new Map(p.cast.map((c) => [normName(c.characterName), c]));
  const sceneCount = new Map<string, number>();
  for (const s of d.scenes) for (const n of sceneCast(p, s)) sceneCount.set(n, (sceneCount.get(n) ?? 0) + 1);
  const names = [...new Set([...p.characters.map((c) => c.name), ...d.characters.map((c) => c.name), ...p.cast.map((c) => normName(c.characterName))].filter(Boolean))];
  const entries = names.map((name) => ({
    name, profile: p.characters.find((c) => c.name === name), scenes: sceneCount.get(name) ?? 0, lines: lines.get(name) ?? 0,
    actor: castBy.get(name)?.actorName || undefined, castNumber: castBy.get(name)?.castNumber,
  }));
  return entries.sort((a, b) => Number(!!b.profile) - Number(!!a.profile) || (a.castNumber ?? 999) - (b.castNumber ?? 999) || b.lines - a.lines || a.name.localeCompare(b.name));
}

/** Continuity looks for a character in a scene (for the breakdown's 👕 hint). */
export function looksInScene(p: Project, name: string, sceneId: string): string[] {
  const prof = p.characters.find((c) => c.name === normName(name));
  if (!prof) return [];
  return [...new Set(prof.continuity.filter((x) => x.sceneIds.includes(sceneId)).map((x) => x.look || x.caption || (x.kind === 'hair' ? 'Hair & makeup' : 'Wardrobe')))];
}

/** Which character the Characters tab shows; other tabs set it to jump to a profile. */
export const useCharacterFocus = create<{ name: string | null }>(() => ({ name: null }));

export function openCharacter(name: string) {
  useCharacterFocus.setState({ name: normName(name) });
  window.dispatchEvent(new CustomEvent('opengate:goto', { detail: 'characters' }));
}
