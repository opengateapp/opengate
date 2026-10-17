import type { Draft } from 'immer';
import type { Project } from '../model/types';
import type { ParsedScript } from './fountain';
import { linesToDoc, docToBlocks, normalizeHeading } from '../script/schema';

/**
 * Replaces the project's script with imported lines. Scenes whose heading text matches
 * an existing scene (same heading, same occurrence) keep their sceneId, so breakdown
 * data, shots and schedule placements survive a re-import of a revised draft.
 */
export function applyImportedScript(d: Draft<Project>, parsed: ParsedScript): { kept: number; added: number } {
  const old = new Map<string, string[]>();
  for (const b of docToBlocks(d.scriptDoc)) {
    if (b.type !== 'sceneHeading' || !b.attrs.sceneId) continue;
    const k = normalizeHeading(b.text);
    old.set(k, [...(old.get(k) ?? []), b.attrs.sceneId as string]);
  }
  let kept = 0;
  let added = 0;
  const doc = linesToDoc(parsed.lines, (key, occ) => {
    const id = old.get(key)?.[occ];
    if (id) kept++;
    else added++;
    return id;
  });
  d.scriptDoc = doc.toJSON();
  if (parsed.lines.some((l) => l.sceneNumber)) d.sceneNumbersLocked = true;
  if (parsed.titlePage) {
    for (const [k, v] of Object.entries(parsed.titlePage)) if (v) (d.titlePage as unknown as Record<string, unknown>)[k] = v;
    if (parsed.titlePage.title) d.title = parsed.titlePage.title;
  }
  return { kept, added };
}
