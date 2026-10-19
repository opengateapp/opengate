import type { BibleGenre, Project, StoryBible, TimeOfDay } from '../model/types';
import type { Derived } from '../script/derive';
import { sceneTime } from '../script/derive';

// Story Bible: the world of the story — overview, places, groups, glossary, rules of the world and
// a timeline of story days. Kept light for contemporary stories; genre templates add sections.

export const GENRES: { id: BibleGenre; label: string; rules: boolean; hint: string }[] = [
  { id: 'contemporary', label: 'Contemporary', rules: false, hint: 'Our world, today. No rules section; places and groups only if you want them.' },
  { id: 'period', label: 'Period', rules: true, hint: 'A real past: customs, technology and language of the time go in Rules.' },
  { id: 'fantasy', label: 'Fantasy', rules: true, hint: 'Magic, kingdoms, creatures — write down how magic works and what it costs.' },
  { id: 'scifi', label: 'Science fiction', rules: true, hint: 'Technology, travel, societies — what’s possible and what isn’t.' },
  { id: 'horror', label: 'Horror / supernatural', rules: true, hint: 'What the threat wants, what stops it, what the characters don’t know yet.' },
];

export function emptyBible(genre: BibleGenre = 'contemporary'): StoryBible {
  return { genre, logline: '', synopsis: '', tone: '', themes: [], places: [], groups: [], glossary: [], rules: [], events: [], boardIds: [] };
}

export const bibleOf = (p: Pick<Project, 'bible'>): StoryBible => ({ ...emptyBible(), ...p.bible });

/** Starter rules for a genre, so the section isn't a blank page. */
export const RULE_PROMPTS: Record<BibleGenre, string[]> = {
  contemporary: [],
  period: ['Year and place', 'Technology people have (and don’t)', 'Social rules and class', 'How people speak'],
  fantasy: ['How magic works', 'What magic costs', 'Who rules, and how', 'Creatures and peoples'],
  scifi: ['What technology can do', 'How people travel and communicate', 'Who holds power', 'What’s different about daily life'],
  horror: ['What the threat is', 'What it wants', 'What stops or repels it', 'What the characters don’t know'],
};

const MORNINGISH: TimeOfDay[] = ['DAWN', 'DAY'];
const order: Record<TimeOfDay, number> = { DAWN: 0, DAY: 1, AFTERNOON: 2, DUSK: 3, NIGHT: 4, CUSTOM: -1 };

/**
 * Suggests a story day for every scene from the headings: a new day starts when a morning or
 * day scene follows an evening or night one. Scenes you've set by hand keep their day, and
 * the count carries on from them.
 */
export function suggestStoryDays(p: Project, d: Derived): Map<string, number> {
  const out = new Map<string, number>();
  let day = 1;
  let last = -1;
  for (const s of d.scenes) {
    const set = p.sceneMeta[s.id]?.storyDay;
    const t = sceneTime(p, s);
    if (set != null) { day = set; last = order[t]; out.set(s.id, set); continue; }
    if (last >= 0 && order[t] >= 0 && MORNINGISH.includes(t) && order[t] < last) day++;
    if (order[t] >= 0) last = order[t];
    out.set(s.id, day);
  }
  return out;
}

/** Scenes grouped by story day (scenes without one go under 0), in script order. */
export function scenesByDay(p: Project, d: Derived): Map<number, string[]> {
  const by = new Map<number, string[]>();
  for (const s of d.scenes) {
    const day = p.sceneMeta[s.id]?.storyDay ?? 0;
    by.set(day, [...(by.get(day) ?? []), s.id]);
  }
  return new Map([...by.entries()].sort((a, b) => a[0] - b[0]));
}

/** Scenes that take place at a story place: its linked shooting location's sets, or a set with the place's name. */
export function placeScenes(p: Project, d: Derived, place: { name: string; locationId?: string }): string[] {
  const loc = place.locationId ? p.locations.find((l) => l.id === place.locationId) : undefined;
  const name = place.name.trim().toUpperCase();
  return d.scenes.filter((s) => (loc && (s.set === loc.setName || p.sceneMeta[s.id]?.locationId === loc.id)) || (name && s.set.toUpperCase().includes(name))).map((s) => s.id);
}
