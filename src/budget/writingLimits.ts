import type { Project, WritingHave, WritingKind, WritingLimitsSet, WritingPlan } from '../model/types';
import type { Derived } from '../script/derive';

// "Start from a budget": what an amount of money buys (shoot days, locations, speaking roles, crew,
// pages), and how a script measures up while it's being written. Rules of thumb, labelled rough:
// every rate is an editable default.

export interface WritingRates { crewDay: number; castDay: number; unionDay: number; phPct: number; food: number; gearDay: number; locationDay: number; transportDay: number; postPct: number; marketingPct: number; contingencyPct: number; insurance: number }

/** Rough defaults (USD). The union day rate and P&H are SAG-AFTRA Ultra Low, checked 2026-10-23. */
export const ROUGH_RATES: WritingRates = { crewDay: 200, castDay: 125, unionDay: 257, phPct: 22, food: 20, gearDay: 300, locationDay: 300, transportDay: 50, postPct: 12, marketingPct: 6, contingencyPct: 10, insurance: 400 };

const TARGET_DAYS: Record<WritingKind, number> = { short: 3, feature: 12, music: 1, other: 2 };
const CAP = { shootDays: 30, crew: 15, speakingRoles: 15, locations: 12 };

interface State { shootDays: number; crew: number; speakingRoles: number; locations: number }

/** Money left for the shoot once post, marketing, insurance and the contingency are set aside. */
function shootMoney(money: number, r: WritingRates) {
  const kept = money / (1 + r.contingencyPct / 100);
  return kept - Math.max(money >= 2000 ? 500 : 0, kept * r.postPct / 100) - kept * r.marketingPct / 100 - (money >= 3000 ? r.insurance : 0);
}

function costOf(s: State, have: WritingHave, r: WritingRates) {
  const paidCrew = Math.max(0, s.crew - have.helpers);
  const castRate = have.unionTier ? r.unionDay * (1 + r.phPct / 100) : r.castDay;
  const paidLocs = Math.max(0, s.locations - have.locations.length);
  // Speaking roles average about 70% of the shoot; paid locations get their share of the days.
  const perDay = paidCrew * r.crewDay + s.speakingRoles * 0.7 * castRate + (s.crew + s.speakingRoles) * r.food + (have.gear ? 0 : r.gearDay) + r.transportDay;
  return s.shootDays * perDay + (paidLocs ? (s.shootDays * paidLocs / s.locations) * r.locationDay + paidLocs * r.locationDay : 0);
}

/**
 * What the money buys. Walks a fixed list of upgrades (days up to the usual length for the kind of
 * film, then a role, a crew member, a day, a location, in turn) and stops at the first one it can't
 * afford, so more money never buys less.
 */
export function budgetToLimits(money: number, have: WritingHave, r: WritingRates = ROUGH_RATES): { limits: WritingLimitsSet; perLocation: number; shoot: number } {
  const shoot = shootMoney(money, r);
  let s: State = { shootDays: 1, crew: 2, speakingRoles: 2, locations: Math.max(1, have.locations.length) };
  const steps: ((x: State) => State)[] = [];
  for (let i = 1; i < TARGET_DAYS[have.kind]; i++) steps.push((x) => ({ ...x, shootDays: x.shootDays + 1 }));
  for (let i = 0; i < 40; i++) {
    steps.push((x) => ({ ...x, speakingRoles: Math.min(CAP.speakingRoles, x.speakingRoles + 1) }));
    steps.push((x) => ({ ...x, crew: Math.min(CAP.crew, x.crew + 1) }));
    steps.push((x) => ({ ...x, shootDays: Math.min(CAP.shootDays, x.shootDays + 1) }));
    steps.push((x) => ({ ...x, locations: Math.min(CAP.locations, x.locations + 1) }));
  }
  for (const step of steps) {
    const next = step(s);
    if (costOf(next, have, r) > shoot) break;
    s = next;
  }
  const ppd = have.pagesPerDay || 4;
  const limits: WritingLimitsSet = {
    ...s,
    pagesMax: Math.max(1, Math.round(s.shootDays * ppd)),
    pagesMin: Math.max(1, Math.round(s.shootDays * ppd * 0.75)),
    // Night shoots need more light and slower days: about one night scene per two shoot days.
    nightScenes: Math.max(have.gear ? 1 : 0, Math.floor(s.shootDays / 2)),
  };
  return { limits, perLocation: Math.round(r.locationDay * 2), shoot: Math.round(shoot) };
}

// ---------------------------------------------------------------- the script against the limits

export interface CostFlag { id: string; label: string; why: string; sceneIds: string[] }

const FLAGS: { id: string; label: string; why: string; words: RegExp; tags: RegExp }[] = [
  { id: 'crowd', label: 'Crowds & extras', why: 'Every extra needs food, wardrobe and wrangling.', words: /\b(crowd|extras|audience|hundreds of|dozens of|packed|stadium|protest(?:ers)?|party guests|busy (?:street|restaurant|bar))\b/i, tags: /extra|background/i },
  { id: 'vehicle', label: 'Vehicles', why: 'Picture cars, drivers, towing or a process trailer, and permits.', words: /\b(car chase|chase|drives? (?:off|away|fast)|speeds|truck|police car|motorcycle|bus|vehicle|highway|crashes into)\b/i, tags: /vehicle/i },
  { id: 'weather', label: 'Weather', why: 'Rain and snow are made with machines (or you wait for them).', words: /\b(rain(?:s|ing|storm)?|snow(?:s|ing)?|storm|thunder|lightning|downpour|blizzard|fog)\b/i, tags: /weather|special effect|sfx/i },
  { id: 'kids', label: 'Children', why: 'Shorter hours, a guardian on set, work permits.', words: /\b(child|children|kid|kids|baby|toddler|little (?:boy|girl)|(?:[2-9]|1[0-5])[- ]year[- ]old)\b/i, tags: /minor|child/i },
  { id: 'animals', label: 'Animals', why: 'A trainer, and the animal sets the pace.', words: /\b(dog|puppy|cat|horse|bird|snake|animal|cow|chicken)s?\b/i, tags: /animal|livestock/i },
  { id: 'stunts', label: 'Stunts & fights', why: 'A stunt coordinator, rehearsal time and insurance.', words: /\b(fight|punch(?:es)?|falls? (?:down|from|off)|tackles?|crash(?:es)?|stunt|jumps? (?:from|off)|thrown|gunfire|shoots? at)\b/i, tags: /stunt/i },
  { id: 'period', label: 'Period or world-building', why: 'Wardrobe, props and locations that look like another time.', words: /\b(1[0-8]\d\d|19[0-5]\d|medieval|victorian|period|ancient|wild west|future city|spaceship)\b/i, tags: /period/i },
  { id: 'vfx', label: 'Visual effects', why: 'Each shot costs post time and money.', words: /\b(explod(?:es|ing)|explosion|monster|creature|magic|hologram|transforms?|disappears into thin air|cgi|vfx|portal|flying)\b/i, tags: /vfx|visual effect|special effect|sfx/i },
];

export interface WritingCheck {
  pages: number;
  estDays: number;
  locations: { name: string; sceneIds: string[] }[];
  speakingRoles: string[];
  nightSceneIds: string[];
  flags: CostFlag[];
  /** Scenes that take the script past a limit, with what it costs. */
  notes: { sceneId: string; text: string }[];
}

/** The script measured against the plan. */
export function writingCheck(p: Project, d: Derived, plan: WritingPlan): WritingCheck {
  const L = plan.limits;
  const text = new Map<string, string>();
  let cur = '';
  for (const b of d.blocks) {
    if (b.type === 'sceneHeading') cur = String(b.attrs.sceneId ?? '');
    else if (cur && (b.type === 'action' || b.type === 'dialogue' || b.type === 'parenthetical')) text.set(cur, `${text.get(cur) ?? ''} ${b.text}`);
  }
  const catName = new Map(p.categories.map((c) => [c.id, c.name]));
  const flags: CostFlag[] = FLAGS.map((f) => {
    const ids = new Set<string>();
    for (const s of d.scenes) if (f.words.test(`${s.heading} ${text.get(s.id) ?? ''}`)) ids.add(s.id);
    for (const e of p.elements) if (f.tags.test(catName.get(e.categoryId) ?? '')) {
      for (const s of d.scenes) if (e.sceneIds.includes(s.id) || s.taggedElementIds.includes(e.id)) ids.add(s.id);
    }
    return { id: f.id, label: f.label, why: f.why, sceneIds: d.scenes.filter((s) => ids.has(s.id)).map((s) => s.id) };
  }).filter((f) => f.sceneIds.length);
  const notes: WritingCheck['notes'] = [];
  const seenSets: string[] = [];
  const seenRoles: string[] = [];
  let nights = 0;
  for (const s of d.scenes) {
    const set = s.set.trim().toUpperCase();
    if (set && !seenSets.includes(set)) {
      seenSets.push(set);
      if (seenSets.length > L.locations) notes.push({ sceneId: s.id, text: `Adds location ${seenSets.length} (${s.set}), one more than planned: about +$${plan.perLocation.toLocaleString('en-US')} and maybe +½ day for the move.` });
    }
    for (const c of s.characters) if (!seenRoles.includes(c)) {
      seenRoles.push(c);
      if (seenRoles.length > L.speakingRoles) notes.push({ sceneId: s.id, text: `${c} is speaking role ${seenRoles.length}; the plan has ${L.speakingRoles}. Could they be silent, or one of the others?` });
    }
    if (s.time === 'NIGHT') {
      nights++;
      if (nights > L.nightScenes) notes.push({ sceneId: s.id, text: `Night scene ${nights} of ${L.nightScenes} planned. Could it be day, or an interior?` });
    }
  }
  const ppd = plan.have.pagesPerDay || 4;
  return {
    pages: d.pageCount,
    estDays: Math.round((d.pageCount / ppd) * 2) / 2,
    locations: d.sets.map((x) => ({ name: x.name, sceneIds: x.sceneIds })),
    speakingRoles: d.characters.map((c) => c.name),
    nightSceneIds: d.scenes.filter((s) => s.time === 'NIGHT').map((s) => s.id),
    flags,
    notes,
  };
}

// ---------------------------------------------------------------- story prompts

const PROMPTS: ((loc: string, thing: string) => string)[] = [
  (l) => `Two people are stuck in ${l} for one night, and one of them is lying about why.`,
  (l, t) => `Someone comes back to ${l} for ${t}, and whoever has it now doesn't want to give it up.`,
  (l) => `It all happens in ${l}, in real time: a job interview that turns into something else.`,
  (l, t) => `${cap(t)} goes missing from ${l}. Everyone who was there has a reason to have taken it.`,
  (l) => `A stranger knocks at ${l} with a message from someone who died last year.`,
  (l) => `Closing time at ${l}: the last customer won't leave, and the owner finds out why.`,
];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A few contained-story prompts built from what you have. No AI: templates filled in. */
export function storyPrompts(have: WritingHave, n = 4): string[] {
  const locs = have.locations.length ? have.locations : ['your apartment'];
  const things = have.extras?.length ? have.extras : ['an old photograph', 'a set of keys', 'a letter'];
  return PROMPTS.slice(0, Math.max(n, 1)).map((f, i) => f(locs[i % locs.length], things[i % things.length]));
}

export const DEFAULT_HAVE: WritingHave = { kind: 'short', gear: true, locations: [], helpers: 2, pagesPerDay: 4 };
