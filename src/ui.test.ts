import { describe, expect, it } from 'vitest';
import { parsePhoneTabs, visibleSections, LITE_DEFAULT, usePhoneTabs, registerSections } from './ui/phoneTabs';

const SECTIONS = [
  { id: 'write', label: 'Write', tabs: [{ id: 'screenplay', label: 'Screenplay', hint: '' }, { id: 'docs', label: 'Docs', hint: '' }] },
  { id: 'plan', label: 'Plan', tabs: [{ id: 'contacts', label: 'Contacts', hint: '' }, { id: 'tasks', label: 'Tasks', hint: '' }, { id: 'calendar', label: 'Calendar', hint: '' }] },
  { id: 'budget', label: 'Budget', tabs: [{ id: 'budget', label: 'Budget', hint: '' }] },
  { id: 'settings', label: 'Settings', tabs: [{ id: 'setup', label: 'Settings', hint: '' }] },
];

describe('Open Gate Lite', () => {
  it('reads saved settings, dropping unknown tabs and falling back to the defaults', () => {
    const known = ['screenplay', 'docs', 'contacts', 'tasks', 'calendar', 'budget'];
    expect(parsePhoneTabs({ lite: false, tabs: ['tasks', 'nope', 'tasks', 'budget'] }, known)).toEqual({ lite: false, tabs: ['tasks', 'budget'] });
    expect(parsePhoneTabs(null, known)).toEqual({ lite: true, tabs: LITE_DEFAULT.filter((t) => known.includes(t)) });
    expect(parsePhoneTabs({ tabs: [] }, known).tabs.length).toBeGreaterThan(0);
  });

  it('shows only the chosen tabs, in the chosen order, on phones only', () => {
    const s = { lite: true, tabs: ['calendar', 'screenplay', 'contacts'] };
    const phone = visibleSections(SECTIONS, s, true);
    expect(phone.map((x) => [x.id, x.tabs.map((t) => t.id)])).toEqual([['write', ['screenplay']], ['plan', ['calendar', 'contacts']]]);
    expect(visibleSections(SECTIONS, s, false)).toBe(SECTIONS);
    expect(visibleSections(SECTIONS, { ...s, lite: false }, true)).toBe(SECTIONS);
  });

  it('adds, removes, reorders and resets tabs', () => {
    registerSections(SECTIONS);
    const st = usePhoneTabs.getState;
    st().reset();
    expect(st().tabs).toEqual(['screenplay', 'calendar', 'tasks', 'contacts']);
    st().toggle('budget', true);
    st().toggle('tasks', false);
    st().move('budget', -1);
    expect(st().tabs).toEqual(['screenplay', 'calendar', 'budget', 'contacts']);
    st().reorder('contacts', 'screenplay');
    expect(st().tabs).toEqual(['contacts', 'screenplay', 'calendar', 'budget']);
    expect(JSON.parse(localStorage.getItem('opengate.mobileTabs')!).tabs).toEqual(st().tabs);
  });
});
