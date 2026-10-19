import { describe, expect, it } from 'vitest';
import { setPrefs, usePrefs } from './prefs';
import { formatClock12, formatDate } from './model/dates';
import { sceneMinutes, derive } from './script/derive';
import { newProject } from './model/defaults';
import { produce } from 'immer';
import { parseFountain } from './io/fountain';
import { applyImportedScript } from './io/applyImport';
import { SAMPLE_FOUNTAIN } from './model/sample';

describe('app preferences', () => {
  it('switches the clock and date styles', () => {
    setPrefs({ clock: '12', dateStyle: 'us' });
    expect(formatClock12(19 * 60 + 5)).toBe('7:05 PM');
    expect(formatDate('2026-10-19', { month: 'short', day: 'numeric' })).toBe('Oct 19');
    setPrefs({ clock: '24', dateStyle: 'intl' });
    expect(formatClock12(19 * 60 + 5)).toBe('19:05');
    expect(formatDate('2026-10-19', { month: 'short', day: 'numeric' })).toBe('19 Oct');
    setPrefs({ dateStyle: 'iso' });
    expect(formatDate('2026-10-19', { month: 'short', day: 'numeric' })).toBe('2026-10-19');
    setPrefs({ clock: '12', dateStyle: 'auto' });
    expect(usePrefs.getState().clock).toBe('12');
  });
  it('scene estimates follow the project’s minutes per eighth', () => {
    const p = produce(newProject('x'), (dr) => { applyImportedScript(dr, parseFountain(SAMPLE_FOUNTAIN)); });
    const s = derive(p.scriptDoc).scenes[0];
    const base = sceneMinutes(p, s);
    const faster = produce(p, (dr) => { dr.production.minutesPerEighth = 5; });
    expect(sceneMinutes(faster, s)).toBe(base / 3);
  });
});
