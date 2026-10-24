import { describe, expect, it } from 'vitest';
import { FAQ, FAQ_GROUPS } from './reference/faq';
import { pageById } from './reference/topics';
import { SECTIONS } from './App';
import { issueUrl, safeSummary } from './help/feedback';
import { buildSampleProduction } from './model/sampleProduction';
import { derive } from './script/derive';

describe('help and feedback', () => {
  it('opens the right GitHub form, filled in with the app, never the project', () => {
    const u = new URL(issueUrl('bug', 'budget'));
    expect(u.origin + u.pathname).toBe('https://github.com/opengateapp/opengate/issues/new');
    expect(u.searchParams.get('template')).toBe('bug.yml');
    expect(u.searchParams.get('version')).toBeTruthy();
    expect(u.searchParams.get('tab')).toBe('budget');
    expect(new URL(issueUrl('resource')).searchParams.get('version')).toBeNull();
  });
  it('the safe summary has counts only', () => {
    const p = buildSampleProduction();
    const s = safeSummary(p, derive(p.scriptDoc));
    expect(s).toMatch(/Scenes: \d+/);
    for (const secret of [p.title, p.cast[0].actorName, p.crew[0].name, p.locations[0].realName]) expect(s).not.toContain(secret);
  });
  it('every FAQ answer is in a group and links somewhere real', () => {
    const tabs = new Set(SECTIONS.flatMap((s) => s.tabs.map((t) => t.id)));
    expect(new Set(FAQ.map((f) => f.id)).size).toBe(FAQ.length);
    for (const f of FAQ) {
      expect(FAQ_GROUPS).toContain(f.group);
      for (const l of f.links ?? []) {
        if (l.tab) expect(tabs.has(l.tab as never)).toBe(true);
        if (l.ref) expect(pageById(l.ref)).toBeTruthy();
        if (l.url) expect(l.url).toMatch(/^https:\/\//);
      }
    }
    expect(pageById('faq')).toBeTruthy();
  });
});
