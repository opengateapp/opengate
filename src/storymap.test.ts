import { describe, expect, it } from 'vitest';
import { arrange, connector, edgePoint, makeItem, mentionsOf, wikiLinks, bounds } from './tabs/boards/boardOps';
import type { Board } from './model/types';

describe('story maps', () => {
  it('connector ends sit on the edges of the boxes they join', () => {
    expect(edgePoint({ x: 0, y: 0, w: 100, h: 50 }, 300, 25)).toEqual({ x: 100, y: 25 });
    expect(edgePoint({ x: 0, y: 0, w: 100, h: 50 }, 50, -200)).toEqual({ x: 50, y: 0 });
  });
  it('reads [[links]] and finds where a character is mentioned', () => {
    expect(wikiLinks('Meet [[Maya]] at [[Drive-in theater]] — not [[ ]]')).toEqual(['Maya', 'Drive-in theater', '']);
    const a = makeItem('note', 0, 0, { text: 'Ask [[maya]] about the reel' });
    const b = makeItem('card', 0, 0, { ref: { kind: 'character', id: 'THEO' } });
    const boards: Board[] = [
      { id: 'b1', title: 'Clues', kind: 'story', items: [a], updatedAt: '' },
      { id: 'b2', title: 'Cast map', kind: 'story', items: [b], updatedAt: '' },
    ];
    expect(mentionsOf(boards, ['MAYA'], { kind: 'character', id: 'MAYA' }).map((x) => x.title)).toEqual(['Clues']);
    expect(mentionsOf(boards, ['THEO'], { kind: 'character', id: 'THEO' }).map((x) => x.title)).toEqual(['Cast map']);
  });
  it('arranges a tree by following connectors, and fit ignores connectors', () => {
    const root = makeItem('note', 0, 0), k1 = makeItem('note', 500, 500), k2 = makeItem('note', -300, 900), gk = makeItem('note', 50, 50);
    const items = [root, k1, k2, gk, connector(root.id, k1.id), connector(root.id, k2.id), connector(k1.id, gk.id)];
    const pos = arrange(items, 'tree');
    expect(pos.size).toBe(4);
    expect(pos.get(k1.id)!.y).toBe(pos.get(k2.id)!.y);
    expect(pos.get(gk.id)!.y).toBeGreaterThan(pos.get(k1.id)!.y);
    expect(pos.get(root.id)!.y).toBeLessThan(pos.get(k1.id)!.y);
    expect(bounds([connector('a', 'b')])).toBeNull();
    const grid = arrange([root, k1, k2, gk], 'grid');
    expect(new Set([...grid.values()].map((q) => q.y)).size).toBe(2);
  });
});
