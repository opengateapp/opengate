import { describe, expect, it } from 'vitest';
import { CHANNELS_V2, accessFromLink, accessWarnings, channelOf, linkFromAccess, setChannelFormat, TAB_ACCESS } from './sync/channels';
import { canEdit, canWrite, scriptMarksOnly, tabHidden, useSync } from './sync/state';
import { newProject } from './model/defaults';
import { projectFields } from './sync/channels';

describe('per-tab access', () => {
  it('every project field has a per-tab channel', () => {
    const p = { ...newProject('x'), gear: [], plans: [], drafts: [], bible: undefined, structure: undefined, revision: undefined, sceneVariants: [], sceneVariantActive: {}, autoDrafts: true };
    for (const f of projectFields(p as never)) expect(CHANNELS_V2).toContain(channelOf(f, 2));
    expect(channelOf('characters', 2)).toBe('characters');
    expect(channelOf('characters', 1)).toBe('write');
    expect(channelOf('schedule', 2)).toBe('schedule');
  });

  it('turns per-tab choices into link permissions and back', () => {
    const access = Object.fromEntries(TAB_ACCESS.map((t) => [t.id, 'view'])) as Record<string, 'edit' | 'view' | 'hidden'>;
    Object.assign(access, { characters: 'edit', breakdown: 'edit', budget: 'hidden', callsheets: 'hidden' });
    const l = linkFromAccess(access);
    expect(l.write.sort()).toEqual(['breakdown', 'characters', 'script']);
    expect(l.hide.sort()).toEqual(['budget', 'callsheets']);
    expect(l.read).toEqual([]);
    expect(accessFromLink(l.write, l.hide)).toMatchObject({ characters: 'edit', breakdown: 'edit', screenplay: 'view', budget: 'hidden', callsheets: 'hidden' });
    // The script text is only hidden when nothing that shows it is visible.
    const none = linkFromAccess(Object.fromEntries(TAB_ACCESS.map((t) => [t.id, 'hidden'])));
    expect(none.hide).toContain('script');
    expect(accessWarnings({ ...access, contacts: 'hidden' })).toEqual([]); // call sheets hidden too
    expect(accessWarnings({ ...access, callsheets: 'view', contacts: 'hidden' })[0]).toMatch(/Call Sheets uses Contacts/);
  });

  it('checks edits by field, maps old section links, and hides tabs', () => {
    setChannelFormat(2);
    useSync.setState({ write: ['characters', 'script'], admin: false, hidden: ['budget', 'callsheets'] });
    expect(canEdit('relationships')).toBe(true);
    expect(canEdit('docs')).toBe(false);
    expect(scriptMarksOnly()).toBe(true);
    expect(canWrite('budget')).toBe(false);
    expect(tabHidden('callsheets')).toBe(true);
    expect(tabHidden('expenses')).toBe(true); // follows the budget
    expect(tabHidden('screenplay')).toBe(false);
    // A link made before per-tab access ("plan" section) covers contacts, calendar and tasks.
    useSync.setState({ write: ['plan'], hidden: [] });
    expect(canEdit('contacts')).toBe(true);
    expect(canEdit('events')).toBe(true);
    expect(canEdit('shots')).toBe(false);
    setChannelFormat(1);
    useSync.setState({ write: null, admin: false, hidden: [] });
  });
});
