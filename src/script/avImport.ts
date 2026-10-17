import type { AVRow } from '../model/types';
import type { Block } from './schema';
import { normalizeCharacter, type Derived } from './derive';
import { newId } from '../model/ids';

// Screenplay → A/V script rows. Each scene becomes a segment (its heading). With "full",
// action goes to the Video column and dialogue ("NAME: line") to the Audio column, paired
// up in order so what we see sits beside what we hear.

export type AVImportMode = 'headings' | 'full';

export function avRowsFromScript(d: Derived, mode: AVImportMode, skipSceneIds: Set<string> = new Set()): AVRow[] {
  const rows: AVRow[] = [];
  const headingIdx = new Map(d.scenes.map((s) => [d.pagination.scenes[s.index]?.blockIndex, s]));
  let current: { sceneId: string; rows: AVRow[] } | null = null;
  let speaker = '';
  let paren = '';

  const flushScene = () => {
    if (current) rows.push(...current.rows);
    current = null;
  };
  const row = (sceneId: string, segment?: string): AVRow => ({ id: newId(), video: '', audio: '', duration: '', sceneId, ...(segment !== undefined ? { segment } : {}) });

  d.blocks.forEach((b: Block, i) => {
    const scene = headingIdx.get(i);
    if (scene) {
      flushScene();
      if (skipSceneIds.has(scene.id)) return;
      current = { sceneId: scene.id, rows: [row(scene.id, `${scene.number}. ${scene.heading}`)] };
      return;
    }
    if (!current || mode === 'headings') return;
    const cur = current as { sceneId: string; rows: AVRow[] };
    const last = cur.rows[cur.rows.length - 1];
    const text = b.text.trim();
    if (!text) return;
    switch (b.type) {
      case 'action':
      case 'shot':
      case 'centered':
        // New picture: start a row unless the last one has no picture yet.
        if (last.video) cur.rows.push(row(cur.sceneId));
        cur.rows[cur.rows.length - 1].video = b.type === 'shot' ? text.toUpperCase() : text;
        break;
      case 'character':
        speaker = normalizeCharacter(text);
        paren = '';
        break;
      case 'parenthetical':
        paren = text.startsWith('(') ? text : `(${text})`;
        break;
      case 'dialogue':
      case 'lyric': {
        const line = `${speaker ? `${speaker}${paren ? ` ${paren}` : ''}: ` : ''}${text}`;
        last.audio = last.audio ? `${last.audio}\n${line}` : line;
        paren = '';
        break;
      }
      case 'transition':
        if (last.video) cur.rows.push(row(cur.sceneId));
        cur.rows[cur.rows.length - 1].video = text.toUpperCase();
        break;
    }
  });
  flushScene();
  return rows;
}
