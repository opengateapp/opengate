import type { DerivedScene, Project, TimeOfDay } from '../model/types';
import { docToBlocks, type Block } from './schema';
import { parseHeading } from './heading';
import { paginate, type Pagination } from './paginate';

export interface Derived {
  blocks: Block[];
  pagination: Pagination;
  scenes: DerivedScene[];
  sceneById: Map<string, DerivedScene>;
  characters: { name: string; lines: number; sceneIds: string[] }[];
  sets: { name: string; sceneIds: string[] }[];
  pageCount: number;
  wordCount: number;
}

const INHERIT_TIME = /^(CONTINUOUS|CONT'?D|LATER|MOMENTS LATER|SAME|SAME TIME|A MOMENT LATER|SECONDS LATER)$/;

/** Strips extensions like (V.O.), (O.S.), (CONT'D) and the dual-dialogue caret. */
export function normalizeCharacter(raw: string): string {
  return raw
    .replace(/\^$/, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/^@/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** Auto scene numbers: locked numbers are kept; new scenes after a locked one get A, B… suffixes. */
export function sceneNumbers(blocks: Block[], locked: boolean): string[] {
  const out: string[] = [];
  let last = 0;
  let lastLabel = '';
  let suffix = 0;
  let auto = 0;
  for (const b of blocks) {
    if (b.type !== 'sceneHeading') continue;
    const n = (b.attrs.number as string | null) || null;
    if (n) {
      out.push(n);
      const parsed = parseInt(n, 10);
      if (!isNaN(parsed)) last = parsed;
      lastLabel = n;
      suffix = 0;
    } else if (locked) {
      suffix++;
      out.push((lastLabel || String(last || 0)) + String.fromCharCode(64 + suffix));
    } else {
      auto = Math.max(auto, last) + 1;
      last = auto;
      out.push(String(auto));
    }
  }
  return out;
}

const cache = new WeakMap<object, Map<boolean, Derived>>();

export function derive(doc: unknown, locked = false): Derived {
  if (doc && typeof doc === 'object') {
    const hit = cache.get(doc)?.get(locked);
    if (hit) return hit;
  }
  const blocks = docToBlocks(doc);
  const pagination = paginate(blocks);
  const numbers = sceneNumbers(blocks, locked);
  const scenes: DerivedScene[] = [];
  const charMap = new Map<string, { lines: number; sceneIds: Set<string> }>();
  let current: DerivedScene | null = null;
  let prevTime: TimeOfDay = 'DAY';
  let words = 0;
  let spanIdx = 0;

  blocks.forEach((b) => {
    words += b.text.split(/\s+/).filter(Boolean).length;
    if (b.type === 'sceneHeading') {
      const h = parseHeading(b.text);
      let time = h.time;
      if (time === 'CUSTOM' && INHERIT_TIME.test(h.timeLabel)) time = prevTime;
      prevTime = time;
      const span = pagination.scenes[spanIdx];
      current = {
        id: (b.attrs.sceneId as string) || `scene-${spanIdx}`,
        index: spanIdx,
        number: numbers[spanIdx],
        heading: b.text.toUpperCase(),
        intExt: h.intExt,
        set: h.set,
        time,
        timeLabel: h.timeLabel,
        characters: [],
        taggedElementIds: [],
        shotIds: [],
        firstAction: '',
        eighths: span?.eighths ?? 1,
        startPage: span?.startPage ?? 1,
        endPage: span?.endPage ?? 1,
      };
      scenes.push(current);
      spanIdx++;
    }
    const scene = current as DerivedScene | null;
    if (!scene) return;
    if (b.type === 'character') {
      const name = normalizeCharacter(b.text);
      if (name) {
        if (!scene.characters.includes(name)) scene.characters.push(name);
        const c = charMap.get(name) ?? { lines: 0, sceneIds: new Set<string>() };
        c.lines++;
        c.sceneIds.add(scene.id);
        charMap.set(name, c);
      }
    }
    if (b.type === 'action' && !scene.firstAction && b.text.trim()) scene.firstAction = b.text.trim().slice(0, 160);
    for (const m of b.marks) {
      if (m.type === 'tag') {
        const id = m.attrs.elementId as string;
        if (!scene.taggedElementIds.includes(id)) scene.taggedElementIds.push(id);
      } else if (m.type === 'shotRef') {
        const id = m.attrs.shotId as string;
        if (!scene.shotIds.includes(id)) scene.shotIds.push(id);
      }
    }
  });

  const setMap = new Map<string, string[]>();
  for (const s of scenes) {
    if (!s.set) continue;
    setMap.set(s.set, [...(setMap.get(s.set) ?? []), s.id]);
  }

  const result: Derived = {
    blocks,
    pagination,
    scenes,
    sceneById: new Map(scenes.map((s) => [s.id, s])),
    characters: [...charMap.entries()]
      .map(([name, v]) => ({ name, lines: v.lines, sceneIds: [...v.sceneIds] }))
      .sort((a, b) => b.lines - a.lines),
    sets: [...setMap.entries()].map(([name, sceneIds]) => ({ name, sceneIds })).sort((a, b) => a.name.localeCompare(b.name)),
    pageCount: pagination.pages.length,
    wordCount: words,
  };
  if (doc && typeof doc === 'object') {
    const m = cache.get(doc) ?? new Map();
    m.set(locked, result);
    cache.set(doc, m);
  }
  return result;
}

/** Scene facts merged with the user's per-scene production data. */
export function sceneEighths(p: Project, s: DerivedScene): number {
  return p.sceneMeta[s.id]?.eighthsOverride ?? s.eighths;
}

export function sceneMinutes(p: Project, s: DerivedScene): number {
  return p.sceneMeta[s.id]?.estimatedMinutes ?? Math.max(1, sceneEighths(p, s) * (p.production.minutesPerEighth ?? 15));
}

export function sceneTime(p: Project, s: DerivedScene): TimeOfDay {
  return p.sceneMeta[s.id]?.timeOverride ?? s.time;
}

/** Speaking characters plus non-speaking cast added in the breakdown. */
export function sceneCast(p: Project, s: DerivedScene): string[] {
  const extra = p.sceneMeta[s.id]?.extraCast ?? [];
  return [...new Set([...s.characters, ...extra.map((e) => e.toUpperCase())])];
}

/** All breakdown elements in a scene: tagged in the text or linked by hand. */
export function sceneElements(p: Project, s: DerivedScene) {
  return p.elements.filter((e) => s.taggedElementIds.includes(e.id) || e.sceneIds.includes(s.id));
}
