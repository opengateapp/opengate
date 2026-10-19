// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { newProject } from './model/defaults';
import { parseFountain } from './io/fountain';
import { applyImportedScript } from './io/applyImport';
import { SAMPLE_FOUNTAIN } from './model/sample';
import { derive } from './script/derive';
import { changedBlocks, compareScenes, diffBlocks, lockedPageLabels, makeDraft, nextColor, packDoc, pruneAuto, unpackDoc, dailyDraftDue } from './script/drafts';
import { sceneBlocksIn } from './script/variants';
import { docToBlocks } from './script/schema';

const sample = () => produce(newProject('x'), (dr) => { applyImportedScript(dr, parseFountain(SAMPLE_FOUNTAIN)); });

type N = { type: string; attrs?: Record<string, unknown>; content?: { type: string; text: string }[] };
const edit = (doc: unknown, fn: (c: N[]) => void) => { const d = structuredClone(doc) as { content: N[] }; fn(d.content); return d; };
const text = (t: string, type = 'action'): N => ({ type, content: [{ type: 'text', text: t }] });

describe('script drafts', () => {
  it('packs a draft small and gets the same doc back', async () => {
    const p = sample();
    const data = await packDoc(p.scriptDoc);
    expect(data.startsWith('z:')).toBe(true);
    expect(data.length).toBeLessThan(JSON.stringify(p.scriptDoc).length);
    expect(await unpackDoc(data)).toEqual(p.scriptDoc);
    const dr = await makeDraft(p, 'First draft');
    expect(dr).toMatchObject({ name: 'First draft', scenes: derive(p.scriptDoc).scenes.length });
  });

  it('diffs blocks and finds what changed', () => {
    const a = docToBlocks(sample().scriptDoc);
    const doc2 = edit(sample().scriptDoc, (c) => { c.splice(3, 0, text('A brand new line.')); (c[1].content![0]).text = 'Rewritten action.'; });
    const b = docToBlocks(doc2);
    const ops = diffBlocks(a, b);
    expect(ops.filter((o) => o.op === 'add').length).toBe(2);
    expect(ops.filter((o) => o.op === 'del').length).toBe(1);
    expect([...changedBlocks(a, b)].sort((x, y) => x - y)).toEqual([1, 3]);
  });

  it('reports scenes added, cut, changed and moved', () => {
    const p = sample();
    const from = derive(p.scriptDoc);
    const ids = from.scenes.map((s) => s.id);
    const doc2 = edit(p.scriptDoc, (c) => {
      // Cut the last scene, rewrite a line in scene 1.
      const lastHead = c.map((n, i) => (n.type === 'sceneHeading' ? i : -1)).filter((i) => i >= 0).pop()!;
      c.splice(lastHead);
      const firstHead = c.findIndex((n) => n.type === 'sceneHeading');
      const firstAction = c.findIndex((n, i) => i > firstHead && n.type === 'action');
      c[firstAction].content![0].text = 'Changed.';
      c.push({ type: 'sceneHeading', attrs: { sceneId: 'new1' }, content: [{ type: 'text', text: 'INT. NEW PLACE - DAY' }] });
    });
    const ch = compareScenes(from, derive(doc2));
    expect(ch.find((c) => c.id === ids[ids.length - 1])?.kind).toBe('removed');
    expect(ch.find((c) => c.id === 'new1')?.kind).toBe('added');
    expect(ch.find((c) => c.id === ids[0])?.kind).toBe('changed');
  });

  it('keeps locked page numbers and letters new pages', () => {
    const p = sample();
    const long = edit(p.scriptDoc, (c) => { for (let i = 0; i < 40; i++) c.splice(2, 0, text(`Extra line ${i} that pushes everything down the page.`)); });
    const base = derive(long);
    const grown = edit(long, (c) => { for (let i = 0; i < 60; i++) c.splice(5, 0, text(`Inserted ${i}.`)); });
    const labels = lockedPageLabels(base, derive(grown));
    expect(labels[0]).toBe('1');
    expect(labels.some((l) => /^\d+A$/.test(l))).toBe(true);
    expect(labels.length).toBeGreaterThan(base.pageCount);
  });

  it('cycles revision colours and keeps only 10 automatic drafts', () => {
    expect(nextColor('white')).toBe('blue');
    expect(nextColor('cherry')).toBe('white');
    const autos = Array.from({ length: 14 }, (_, i) => ({ id: `a${i}`, name: '', createdAt: `2026-01-${String(i + 1).padStart(2, '0')}`, data: 'j:null', pages: 1, scenes: 1, words: 1, auto: 'daily' as const }));
    const kept = pruneAuto([...autos, { ...autos[0], id: 'named', auto: undefined }]);
    expect(kept).toHaveLength(11);
    expect(kept.some((x) => x.id === 'named')).toBe(true);
    expect(kept.some((x) => x.id === 'a0')).toBe(false);
  });

  it('daily draft is due only when the script changed', async () => {
    const p = sample();
    expect(await dailyDraftDue(p)).toBe(true);
    const dr = await makeDraft(p, 'x');
    const withDraft = { ...p, drafts: [{ ...dr, createdAt: new Date(Date.now() - 30 * 3600_000).toISOString() }] };
    expect(await dailyDraftDue(withDraft)).toBe(false);
    expect(await dailyDraftDue({ ...withDraft, scriptDoc: edit(p.scriptDoc, (c) => c.push(text('more'))) })).toBe(true);
    expect(await dailyDraftDue({ ...withDraft, autoDrafts: false, scriptDoc: edit(p.scriptDoc, (c) => c.push(text('more'))) })).toBe(false);
  });

  it('finds a scene inside a draft', () => {
    const p = sample();
    const d = derive(p.scriptDoc);
    const blocks = sceneBlocksIn(p.scriptDoc, d.scenes[1].id)!;
    expect((blocks[0] as N).type).toBe('sceneHeading');
    expect(blocks.slice(1).every((b) => (b as N).type !== 'sceneHeading')).toBe(true);
  });
});
