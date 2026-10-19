import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { newProject } from './model/defaults';
import { parseFountain } from './io/fountain';
import { applyImportedScript } from './io/applyImport';
import { SAMPLE_FOUNTAIN } from './model/sample';
import { derive } from './script/derive';
import { bibleOf, placeScenes, scenesByDay, suggestStoryDays } from './bible/bible';
import { channelOf } from './sync/channels';

const sample = () => produce(newProject('x'), (dr) => { applyImportedScript(dr, parseFountain(SAMPLE_FOUNTAIN)); });

describe('story bible', () => {
  it('suggests story days from the headings, keeping days set by hand', () => {
    const p = sample();
    const d = derive(p.scriptDoc);
    expect(d.scenes.map((s) => s.time)).toEqual(['DUSK', 'NIGHT', 'NIGHT', 'NIGHT', 'DAWN']);
    expect([...suggestStoryDays(p, d).values()]).toEqual([1, 1, 1, 1, 2]);
    const q = produce(p, (dr) => { dr.sceneMeta[d.scenes[1].id] = { storyDay: 5 }; });
    expect([...suggestStoryDays(q, d).values()]).toEqual([1, 5, 5, 5, 6]);
    const set = produce(p, (dr) => { for (const [id, day] of suggestStoryDays(p, d)) (dr.sceneMeta[id] ??= {}).storyDay = day; });
    expect([...scenesByDay(set, d).keys()]).toEqual([1, 2]);
  });
  it('finds a place’s scenes by name or linked location, and syncs with Write', () => {
    const p = sample();
    const d = derive(p.scriptDoc);
    expect(placeScenes(p, d, { name: 'Drive-in theater' }).length).toBe(3);
    expect(bibleOf(p).genre).toBe('contemporary');
    expect(channelOf('bible')).toBe('write');
  });
});
