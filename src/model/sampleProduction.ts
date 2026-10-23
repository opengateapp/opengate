import { produce } from 'immer';
import type { BoardItem, BudgetLine, CastMember, Clearance, CrewMember, DealTerms, Festival, PaperDoc, PaperKind, PersonRef, Project, Shot, StoryboardFrame } from './types';
import { newProject, SHOT_COLORS } from './defaults';
import { newId } from './ids';
import { addDays, todayISO, weekday } from './dates';
import { SAMPLE_PRODUCTION_FOUNTAIN } from './sampleScript';
import { parseFountain } from '../io/fountain';
import { applyImportedScript } from '../io/applyImport';
import { derive } from '../script/derive';
import { newProfile } from '../script/characters';
import { newRelationship, mapLayout } from '../script/relationships';
import { emptyBible, suggestStoryDays } from '../bible/bible';
import { setRange, moveScenes } from '../schedule/engine';
import { autofillCallSheet } from '../schedule/callsheet';
import { newPlan, newElement } from '../visualize/plan';
import { newCastMember } from '../paperwork/unions';
import { newDoc, syncPaperworkLines } from '../paperwork/paperwork';
import { applyScan, scanScript, setLocationClearance } from '../paperwork/clearanceScan';
import { cardsFromCallSheet } from '../paperwork/timecards';
import { breakdownFacts, importFromBreakdown } from '../budget/fromBreakdown';
import { newLicense, syncLicenseLines } from '../budget/licenses';
import { budgetView } from '../budget/pipeline';
import { totals } from '../budget/calc';
import { syncGearLines, syncPlanGear } from '../budget/gear';
import { missingMarketingLines } from '../budget/templates';
import { addMarketingTasks } from '../plan/marketingTasks';
import { syncFestivalLines } from '../budget/festivals';

// The sample production: "The Last Reel" filled in across every section, so each tab has something
// real to show, with a few deliberate problems that make the warnings teach:
//  - a non-union actor on a SAG-AFTRA show (Taft-Hartley),
//  - Sheriff Dale's talent release still unsigned (call-sheet readiness),
//  - a late lunch on the stunt day (meal penalty on a time card),
//  - the radio song not cleared yet (clearances, licences),
//  - a 4th location (the diner) added in the production draft,
//  - two stunts, which the Micro-Budget agreement doesn't allow (compare the two budget versions).
// Everyone and everything in it is made up. Rates are typed in as sample numbers: SAG-AFTRA's
// Ultra Low Budget Project rate sheet (day performer $257 from 7/1/2026, P&H 22%, daily stunt
// coordinator $1,283), checked on sagaftra.org on 2026-10-23. No rate tables are built in.

export const SAMPLE_RATES_CHECKED = '2026-10-23';
const UPA_DAY = 257;
const UPA_PH = 22;
const STUNT_COORD_DAY = 1283;

/** The first Monday at least three weeks from today (the shoot starts there). */
function shootStart(): string {
  let d = addDays(todayISO(), 21);
  while (weekday(d) !== 1) d = addDays(d, 1);
  return d;
}

/** Adds a breakdown tag mark to the first mention of `word` in a scene (so the script and sheets highlight it). */
function tagFirst(doc: { content?: Node[] }, sceneId: string, word: string, elementId: string, categoryId: string): boolean {
  let inScene = false;
  for (const block of doc.content ?? []) {
    if (block.type === 'sceneHeading') { if (inScene) return false; inScene = block.attrs?.sceneId === sceneId; continue; }
    if (!inScene || !block.content) continue;
    for (let i = 0; i < block.content.length; i++) {
      const t = block.content[i];
      if (t.type !== 'text' || !t.text) continue;
      const at = t.text.toLowerCase().indexOf(word.toLowerCase());
      if (at < 0 || (t.marks ?? []).some((m) => m.type === 'tag')) continue;
      const part = (text: string, extra: Mark[] = []): Node => ({ type: 'text', text, ...((t.marks?.length || extra.length) ? { marks: [...(t.marks ?? []), ...extra] } : {}) });
      const pieces = [
        at > 0 ? part(t.text.slice(0, at)) : null,
        part(t.text.slice(at, at + word.length), [{ type: 'tag', attrs: { elementId, categoryId } }]),
        at + word.length < t.text.length ? part(t.text.slice(at + word.length)) : null,
      ].filter((x): x is Node => !!x);
      block.content.splice(i, 1, ...pieces);
      return true;
    }
  }
  return false;
}
interface Mark { type: string; attrs?: Record<string, unknown> }
interface Node { type: string; text?: string; attrs?: Record<string, unknown>; marks?: Mark[]; content?: Node[] }

const textDoc = (lines: string[]) => ({
  type: 'doc',
  content: lines.map((l) => {
    const h = l.match(/^(#{1,3})\s+(.*)$/);
    if (h) return { type: 'heading', attrs: { level: h[1].length }, content: [{ type: 'text', text: h[2] }] };
    return l ? { type: 'paragraph', content: [{ type: 'text', text: l }] } : { type: 'paragraph' };
  }),
});

export function buildSampleProduction(): Project {
  const parsed = parseFountain(SAMPLE_PRODUCTION_FOUNTAIN);
  let p = produce(newProject('The Last Reel'), (dr) => { applyImportedScript(dr, parsed); });
  const d0 = derive(p.scriptDoc, p.sceneNumbersLocked);
  /** Scene id by scene number (1–22, in script order). */
  const sc = (n: number) => d0.scenes[n - 1].id;
  const scs = (...ns: number[]) => ns.map(sc);

  // ---------------------------------------------------------------- Write
  p = produce(p, (dr) => {
    dr.production = {
      ...dr.production,
      company: 'Starlite Pictures LLC (sample)',
      director: 'Ana Ruiz',
      producer: 'Jordan Lee',
      ad: 'Ben Ortega',
      contactPhone: '(406) 555-0100',
      defaultCall: '07:00',
      defaultLunch: '13:00',
      agreement: { union: 'SAG-AFTRA', tier: 'Ultra Low Project (UPA)' },
    };
    dr.notes = 'Sample production: a filled-in short film. Everything here is made up; change or delete anything.';
    const sm = (n: number, meta: Partial<Project['sceneMeta'][string]>) => { dr.sceneMeta[sc(n)] = { ...dr.sceneMeta[sc(n)], ...meta }; };
    const synopses: Record<number, string> = {
      1: 'Maya drives the old pickup toward the drive-in.', 2: 'Radio plays "Starlite Serenade"; Maya switches it off.',
      3: 'Maya meets Theo at the abandoned drive-in with the canister.', 4: 'They uncover the projector; a snapped reel.',
      5: '1962: Walter teaches young Theo to thread the projector.', 6: 'Montage: restoring the projector.',
      7: 'Rain. Maya patches the screen and falls from the ladder (stunt).', 8: 'Theo bandages her wrist; the bank has a buyer.',
      9: 'Sheriff Dale: the bank sells Monday; "not a no".', 10: 'Maya races to town in the rain.', 11: 'Flyers slide across the seat.',
      12: 'A deer; the truck swerves and slides onto the shoulder (stunt, VFX deer).', 13: 'Everybody\'s fine.',
      14: 'June at the diner takes the flyers.', 15: 'Theo calls Maya.', 16: 'The phone call: what\'s on the reel.',
      17: 'Saturday: Maya and Theo thread the film together.', 18: 'The wedding on the screen (VFX); cars arrive.',
      19: 'In the truck: "They always know."', 20: 'The full lot; June\'s pies; Dale directs traffic.',
      21: 'Dawn. "Permit?" "Working on it."', 22: 'The sign now reads OPEN SATURDAYS.',
    };
    for (const [n, s] of Object.entries(synopses)) sm(Number(n), { synopsis: s });
    // People in scenes without dialogue (and the stunt performers) are added to those scenes by hand.
    sm(1, { extraCast: ['MAYA'] });
    sm(6, { extraCast: ['MAYA', 'THEO'] });
    sm(7, { extraCast: ['MAYA (STUNT DOUBLE)'], estimatedMinutes: 120, notes: 'Stunt: ladder fall onto pads. Stunt double for Maya; stunt coordinator on set; safety meeting before the first rehearsal.' });
    sm(10, { extraCast: ['MAYA'] });
    sm(11, { extraCast: ['MAYA'] });
    sm(12, { extraCast: ['STUNT DRIVER'], estimatedMinutes: 120, notes: 'Stunt: truck swerve and slide on a closed, wetted road. Stunt driver doubles Maya; the deer is VFX.' });
    sm(15, { extraCast: ['THEO'] });
    sm(20, { extraCast: ['JUNE', 'SHERIFF DALE', 'MAYA'] });
    sm(22, { extraCast: ['SHERIFF DALE'] });

    // Character profiles, relationships and the map.
    const prof = (name: string, role: string, arc: string, archetype: string, info: Record<string, string>, strengths: string[] = [], weaknesses: string[] = []) => {
      const c = newProfile(name);
      Object.assign(c, { role, arc, archetype, gender: info.gender ?? '', race: 'Human', strengths, weaknesses });
      delete info.gender;
      c.info = info;
      dr.characters.push(c);
    };
    prof('MAYA', 'Protagonist', 'Positive change', 'Creator', { gender: 'Female', fullName: 'Maya Lindqvist', age: '34', residence: 'Seattle, WA' }, ['Fixes anything', 'Stubborn in a good way'], ['Won\'t ask for help']);
    prof('THEO', 'Mentor', 'Redemption', 'Sage', { gender: 'Male', fullName: 'Theodore Lindqvist', age: '70', residence: 'Ridgeview, MT' }, ['Remembers everything'], ['Tired', 'Keeps secrets']);
    prof('SHERIFF DALE', 'Supporting', 'Testing', 'Ruler', { gender: 'Male', fullName: 'Dale Marsh', age: '55' }, ['Fair'], ['By the book']);
    prof('JUNE', 'Supporting', 'Flat / steadfast', 'Caregiver', { gender: 'Female', fullName: 'June Alvarez', age: '45' });
    prof('WALTER', 'Supporting', 'Flat / steadfast', 'Creator', { gender: 'Male', fullName: 'Walter Lindqvist', age: '34 (in 1962)' });
    prof('YOUNG THEO', 'Minor', 'Flat / steadfast', 'Innocent', { gender: 'Male', age: '10 (in 1962)' });
    dr.relationships = [
      { ...newRelationship('MAYA', 'THEO', 'family'), label: 'niece / uncle', tone: 2 },
      { ...newRelationship('WALTER', 'YOUNG THEO', 'family'), label: 'father / son', tone: 2 },
      { ...newRelationship('WALTER', 'MAYA', 'family'), label: 'grandfather', tone: 1 },
      { ...newRelationship('SHERIFF DALE', 'THEO', 'friend'), label: 'old customers', tone: 0 },
      { ...newRelationship('JUNE', 'MAYA', 'ally'), label: 'spreads the word', tone: 1 },
    ];

    // Story Bible: logline, places, events; story days (the flashback is its own day).
    const bible = emptyBible('contemporary');
    bible.logline = 'A projectionist and her ageing uncle have one weekend to bring a dead drive-in back to life before the bank sells it, and one reel of film to remind a town why it mattered.';
    bible.synopsis = 'Maya drives home with the last reel her grandfather ever showed. With her uncle Theo she restores the booth projector, survives a fall and a rain-soaked swerve, talks the sheriff into "not a no", and with the help of June at the diner fills the lot for one last show: her grandparents\' 1962 wedding.';
    bible.tone = 'Warm, wistful, a little funny. Small-town Americana; practical light; rain and projector beams.';
    bible.themes = ['Inheritance', 'Community', 'Letting go and holding on'];
    bible.places = [
      { id: newId(), name: 'The Starlite Drive-In', description: 'Built 1958, closed 1989. Torn screen, booth over the snack bar, rows of speaker posts.' },
      { id: newId(), name: 'Ridgeview', description: 'A wheat-country town of 900 with one diner and one sheriff.' },
    ];
    bible.events = [
      { id: newId(), day: 0, title: '1962: Walter and Ellen marry', text: 'Walter films the wedding and later splices it onto the end of a reel.' },
      { id: newId(), day: 0, title: '1989: the bank closes the Starlite', text: 'The night Walter shows the wedding reel. Theo, ten in 1962, is in the booth.' },
    ];
    dr.bible = bible;

    // A treatment in Docs.
    dr.docs.push({ id: newId(), title: 'Treatment', updatedAt: new Date().toISOString(), doc: textDoc([
      '# The Last Reel — treatment', '## Logline', bible.logline, '', '## Synopsis', bible.synopsis, '',
      '## Characters', 'Maya (30s), a projectionist who fixes things. Theo (70), her uncle, who kept the booth standing. Sheriff Dale (50s). June (40s), who runs the diner. Walter, Maya\'s grandfather, in 1962.', '',
      '## Tone & style', bible.tone, '',
      '## Production notes', 'Three shoot days plus a pickup day. Two stunts on Day 1 (ladder fall, truck swerve) with a stunt coordinator. One night at the drive-in with background cars and families.',
    ]) });
  });
  p = produce(p, (dr) => {
    dr.characterMap = mapLayout(dr as Project, ['MAYA', 'THEO', 'WALTER', 'YOUNG THEO', 'SHERIFF DALE', 'JUNE'], true);
    const days = suggestStoryDays(dr as Project, d0);
    for (const [id, day] of days) dr.sceneMeta[id] = { ...dr.sceneMeta[id], storyDay: day };
    dr.sceneMeta[sc(5)] = { ...dr.sceneMeta[sc(5)], storyDay: 0, timeOverride: undefined };
  });

  // ---------------------------------------------------------------- Breakdown
  p = produce(p, (dr) => {
    const el = (categoryId: string, name: string, scenes: number[], tag?: string, notes?: string) => {
      const id = newId();
      dr.elements.push({ id, categoryId, name, sceneIds: scs(...scenes), ...(notes ? { notes } : {}) });
      if (tag) for (const n of scenes) tagFirst(dr.scriptDoc as never, sc(n), tag, id, categoryId);
      return id;
    };
    el('props', 'Film canister', [2, 3, 21], 'canister');
    el('props', 'Flashlight, cane and thermos (Theo)', [3], 'FLASHLIGHT');
    el('props', '35mm projector', [4, 5, 6, 17], 'projector');
    el('props', 'Splicer and xenon lamp', [6], 'SPLICER');
    el('props', 'Staple gun and screen vinyl', [7], 'staple gun');
    el('props', 'First-aid kit', [8], 'FIRST-AID KIT');
    el('props', 'Flyers', [11, 13, 14], 'FLYERS');
    el('props', 'Cherry pies', [14, 20], 'pie');
    el('props', 'Wall phone', [15], 'wall phone');
    el('vehicles', '1978 pickup truck (picture car)', [1, 2, 3, 10, 11, 12, 13, 16, 19], 'PICKUP TRUCK', 'Producer\'s own truck; a second key and a mechanic check before Day 1.');
    el('vehicles', 'Sheriff\'s cruiser', [9, 22], 'cruiser', 'Retired county cruiser, decals covered.');
    el('vehicles', 'Background cars (12)', [18, 20, 21], 'cars', 'Volunteers\' own cars.');
    el('animals', 'Biscuit the dog', [1, 3, 6, 8, 11, 13, 16, 20], 'BISCUIT', 'Trained dog with handler on set; American Humane guidelines.');
    el('extras', 'Moviegoers (30 adults, families)', [18, 20, 21], 'families', 'Volunteers from Ridgeview; sign appearance releases.');
    el('extras', 'Little girl (7) in pyjamas', [20], 'LITTLE GIRL', 'Child background: a parent on set, and check the minor work permit rules.');
    el('stunts', 'Ladder fall (Maya)', [7], 'FALLS', 'About 10 ft onto crash pads hidden under tarps. Stunt double; stunt coordinator; paramedic on standby.');
    el('stunts', 'Truck swerve and slide (Maya driving)', [12], 'SWERVES', 'Closed, wetted road; precision stunt driver; cameras on locked-off mounts; nobody in the bed.');
    el('equipment', 'Crash pads', [7], undefined, 'Rented from the stunt coordinator.');
    el('sfx', 'Rain (rain towers / water truck)', [7, 10, 11, 12], 'RAIN', 'Rain towers at the screen; a water truck wets the road.');
    el('sfx', 'Steam off the asphalt', [9], 'Steam');
    el('wardrobe', '1962 period wardrobe (Walter, Young Theo)', [5], 'skinny tie');
    el('wardrobe', 'Sheriff\'s uniform and reflective vest', [9, 20, 21], 'reflective vest');
    el('wardrobe', 'Maya\'s rain-soaked doubles (x3)', [7, 8, 10, 11, 12, 13, 14], undefined, 'Matching outfits for Maya and her stunt double.');
    el('makeup', 'Wrist bandage (continuity from Sc 8)', [8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 20, 21], 'bandage');
    el('vfx', 'Wedding film on the patched screen (comp)', [18, 20], 'WEDDING', 'Shoot the screen blank, comp the 1962 footage in post.');
    el('vfx', 'CG deer', [12], 'DEER', 'Plate shot with an eyeline pole; deer added in post.');
    el('music', '"Starlite Serenade" — The Velvet Hours (fictional)', [2, 19], 'Starlite Serenade', 'Playback on set; needs a sync and master licence.');
    el('setDressing', 'Coca-Cola sign and FOR SALE board', [3], 'COCA-COLA SIGN', 'Real brand on a sign: clear it or replace it.');
    el('setDressing', '"OPEN SATURDAYS" sign', [22], 'OPEN SATURDAYS');
    el('setDressing', 'Snack bar menu boards (1960s prices)', [8], 'menu boards');
    el('security', 'Traffic control and road closure', [12, 20], undefined, 'Sheriff\'s office for the road closure; volunteers in vests for the lot.');
  });

  // ---------------------------------------------------------------- Plan: people and places
  const ids: Record<string, string> = {};
  p = produce(p, (dr) => {
    const cast = (n: number, character: string, actor: string, extra: Partial<CastMember> = {}) => {
      const c = { ...newCastMember(dr as Project, n, character), actorName: actor, unionStatus: 'member' as const, ...extra };
      dr.cast.push(c);
      ids[character] = c.id;
    };
    cast(1, 'MAYA', 'Nora Vance', { phone: '(406) 555-0111', email: 'nora@example.com' });
    cast(2, 'THEO', 'Harold Brisco', { phone: '(406) 555-0112' });
    cast(3, 'SHERIFF DALE', 'Curtis Webb', { phone: '(406) 555-0113' });
    cast(4, 'JUNE', 'Lena Ortiz', { union: undefined, unionStatus: 'nonunion', phone: '(406) 555-0114' });
    cast(5, 'WALTER', 'Sam Whitlock');
    cast(6, 'YOUNG THEO', 'Eli Park', { notes: undefined } as Partial<CastMember>);
    // Stunt performers are performers: on the cast list, added to their stunt scenes, paid from Stunts.
    cast(7, 'MAYA (STUNT DOUBLE)', 'Dani Reyes', { phone: '(406) 555-0117' });
    cast(8, 'STUNT DRIVER', 'Marcus Bell', { phone: '(406) 555-0118' });

    const crew = (name: string, role: string, extra: Partial<CrewMember> = {}) => {
      const c: CrewMember = { id: newId(), name, role, dailyDefault: true, ...extra };
      dr.crew.push(c);
      ids[role] = c.id;
    };
    crew('Ana Ruiz', 'Director');
    crew('Jordan Lee', 'Producer', { phone: '(406) 555-0100' });
    crew('Ben Ortega', '1st assistant director (1st AD)');
    crew('Iris Cole', 'Director of photography (DP)', { union: 'IATSE', unionStatus: 'member', unionLocal: '600 (camera)', societies: ['asc'] });
    crew('Kat Nguyen', 'Gaffer');
    crew('Omar Haddad', 'Production sound mixer');
    crew('Riley Fox', 'Production assistant (PA)');
    crew('Lou Marsh', 'Stunt coordinator', { dailyDefault: false, union: 'SAG-AFTRA', unionStatus: 'member', phone: '(406) 555-0119' });
    crew('Priya Shah', 'Animal trainer', { dailyDefault: false });

    dr.contacts.push(
      { id: newId(), name: 'Gary Hollis', kind: 'location', role: 'Asset manager (owner\'s agent)', company: 'First Valley Bank', phone: '(406) 555-0142', email: 'ghollis@example.com', notes: 'Controls the drive-in until the sale.' },
      { id: newId(), name: 'Rosie Albers', kind: 'location', role: 'Owner', company: 'Rosie\'s Diner', phone: '(406) 555-0150', email: '', notes: 'Closed Mondays; we shoot then.' },
      { id: newId(), name: 'Sam Ito', kind: 'vendor', role: 'Rental agent', company: 'Big Sky Grip & Electric', phone: '(406) 555-0160', email: 'rentals@example.com', notes: 'Lights and a small generator.' },
      { id: newId(), name: 'County permit desk', kind: 'other', role: 'Film and road-use permits', company: 'Ridgeview County', phone: '(406) 555-0170', email: '', notes: 'Road closure for Sc 12 needs 10 working days.' },
      { id: newId(), name: 'Dr. Ellis', kind: 'other', role: 'Set medic (stunt day)', company: 'Ridgeview Ambulance', phone: '(406) 555-0180', email: '', notes: 'On standby for both stunts.' },
    );

    const loc = (key: string, l: Omit<Project['locations'][number], 'id'>) => { const id = newId(); dr.locations.push({ id, ...l }); ids[key] = id; return id; };
    const driveIn = loc('loc:drive-in', { setName: 'DRIVE-IN THEATER', realName: 'Ridgeview Drive-In (closed)', address: '4400 Old Highway 12, Ridgeview, MT', status: 'confirmed', contactName: 'Gary Hollis', contactPhone: '(406) 555-0142', fee: '$200/day', permit: 'County film permit + public-gathering permit (Sc 18–21)', parking: 'Basecamp by the snack bar', power: 'None: bring the generator', restrooms: 'Rent two portable toilets', nearestHospital: 'Ridgeview General, 12 min', photoIds: [] });
    const road = loc('loc:road', { setName: 'COUNTY ROAD', realName: 'Mill Creek Road (County Rd 12)', address: 'County Rd 12 between mile 3 and 4', status: 'hold', fee: '$150 flat', permit: 'Road-use permit and closure for the swerve (Sc 12): requested', parking: 'Gravel pull-out at mile 3', nearestHospital: 'Ridgeview General, 18 min', photoIds: [] });
    loc('loc:kitchen', { setName: 'THEO\'S KITCHEN', realName: 'The producer\'s aunt\'s house', address: '17 Birch Lane, Ridgeview', status: 'confirmed', fee: 'Free (a thank-you credit)', permit: 'Not needed (private home)', photoIds: [] });
    loc('loc:diner', { setName: 'ROSIE\'S DINER', realName: 'Rosie\'s Diner', address: '210 Main St, Ridgeview', status: 'hold', contactName: 'Rosie Albers', contactPhone: '(406) 555-0150', fee: '$250/day', permit: 'Not needed (private business)', notes: 'Added in the production draft: a 4th location and a pickup day.', photoIds: [] });
    // Scenes at the drive-in and on the road that use other set names (the booth, the truck).
    for (const n of [4, 5, 6, 7, 8, 16, 17, 18, 19]) dr.sceneMeta[sc(n)] = { ...dr.sceneMeta[sc(n)], locationId: driveIn };
    for (const n of [2, 11, 13]) dr.sceneMeta[sc(n)] = { ...dr.sceneMeta[sc(n)], locationId: road };
  });

  // ---------------------------------------------------------------- Schedule and call sheets
  const start = shootStart();
  p = produce(p, (dr) => {
    setRange(dr.schedule, start, addDays(start, 7), 'merge');
    const day = (i: number) => dr.schedule.days[i];
    // Day 1 (Mon): stunt day. Drive-in in the morning, company move, the road in the afternoon.
    moveScenes(dr.schedule, scs(7, 8, 9, 6), day(0).id);
    dr.schedule.days[0].items.push({ kind: 'banner', id: newId(), bannerKind: 'companyMove', title: 'Company move to Mill Creek Road', color: '#64748b', minutes: 45 });
    moveScenes(dr.schedule, scs(10, 11, 12, 13), day(0).id);
    dr.schedule.days[0].items.unshift({ kind: 'banner', id: newId(), bannerKind: 'notice', title: 'Stunt safety meeting: all cast and crew', note: 'Stunt coordinator walks the ladder fall and the swerve. Medic on set.', color: '#dc2626', minutes: 20 });
    Object.assign(day(0).times, { generalCall: '06:00', readyToShoot: '07:00', lunch: '12:00', wrap: '18:30' });
    day(0).notes = 'STUNT DAY. Safety meeting at call. Rain towers at the screen; water truck on the road.';
    // Day 2 (Tue): dusk to dawn at the drive-in.
    moveScenes(dr.schedule, scs(3, 4, 5, 17, 18, 19, 16, 20, 21), day(1).id);
    Object.assign(day(1).times, { generalCall: '16:00', readyToShoot: '17:00', lunch: '22:00', wrap: '06:30' });
    day(1).notes = 'Night shoot. Background cars arrive 19:30. Sunrise for Sc 21.';
    // Day 3 (Wed): dawn on the road, the truck, then Theo's kitchen.
    moveScenes(dr.schedule, scs(22, 1, 2), day(2).id);
    dr.schedule.days[2].items.push({ kind: 'banner', id: newId(), bannerKind: 'companyMove', title: 'Company move to Birch Lane', color: '#64748b', minutes: 30 });
    moveScenes(dr.schedule, scs(15), day(2).id);
    Object.assign(day(2).times, { generalCall: '05:30', readyToShoot: '06:15', lunch: '12:00', wrap: '17:00' });
    // Pickup day (next Mon): the diner, added late (the 4th location).
    moveScenes(dr.schedule, scs(14), day(7).id);
    Object.assign(day(7).times, { generalCall: '08:00', lunch: '12:30', wrap: '14:00' });
    day(7).notes = 'Pickup day: the diner scene added in the production draft.';
  });
  let d = derive(p.scriptDoc, p.sceneNumbersLocked);
  const shootDays = p.schedule.days.filter((x) => x.items.some((i) => i.kind === 'scene'));
  p = produce(p, (dr) => {
    for (const day of shootDays) dr.callSheets[day.id] = autofillCallSheet(dr as Project, d, day);
    const cs = dr.callSheets[shootDays[0].id];
    Object.assign(cs, {
      weatherTemp: '58°F / 44°F', weatherCondition: 'Showers (we bring our own rain anyway)', weatherPrecipWind: '40%, W 10 mph',
      nearestHospital: 'Ridgeview General Hospital, 900 Hospital Dr. (12 min)', basecamp: 'Drive-in snack bar lot',
      quote: '"Then you fix it. That\'s the whole job."',
      notes: 'STUNTS TODAY: Sc 7 ladder fall (Dani Reyes doubling Maya) and Sc 12 truck swerve (Marcus Bell). Stunt coordinator Lou Marsh has final say on safety. Nobody rides in the truck bed. Medic on set all day.\nAnimal: Biscuit with trainer Priya Shah.',
    });
    const coord = dr.crew.find((c) => c.id === ids['Stunt coordinator'])!;
    const trainer = dr.crew.find((c) => c.id === ids['Animal trainer'])!;
    for (const c of [coord, trainer]) if (!cs.crew.some((x) => x.crewId === c.id)) cs.crew.push({ id: newId(), crewId: c.id, role: c.role, name: c.name, call: c === coord ? '05:45' : '06:30', phone: c.phone ?? '' });
  });

  // ---------------------------------------------------------------- Visualize
  p = produce(p, (dr) => {
    let order = 0;
    const shot = (scene: number, num: string, fields: Partial<Shot>) => {
      const s: Shot = { id: newId(), sceneId: sc(scene), order: order++, shotNumber: num, setup: '', name: '', subject: '', shotType: '', angle: '', lens: '', move: '', equipment: '', focus: '', lighting: '', sound: '', vfx: '', action: '', duration: '', priority: 'Must Have', notes: '', quote: '', color: SHOT_COLORS[order % SHOT_COLORS.length], ...fields };
      dr.shots.push(s);
      ids['shot:' + num] = s.id;
      return s;
    };
    shot(1, '1A', { shotType: 'EWS', lens: '24mm', move: 'Static', subject: 'Truck over the rise', action: 'The pickup comes over the rise, tiny in the wheat.' });
    shot(3, '3A', { shotType: 'WS', lens: '24mm', move: 'Static', subject: 'Drive-in, truck arrives', action: 'Headlights through dust; the torn screen behind.' });
    shot(3, '3B', { shotType: 'INS', lens: '50mm', subject: 'The FOR SALE sign', action: 'Rack from the Coca-Cola sign to the FOR SALE board.' });
    shot(3, '3C', { shotType: 'MS', lens: '35mm', subject: 'Maya and Theo', action: '"Is it the one?" "It\'s the one."' });
    shot(5, '5A', { shotType: 'MS', lens: '35mm', subject: 'Walter threads', action: 'Walter threads; Young Theo kneels on the stool.' });
    shot(5, '5B', { shotType: 'CU', lens: '85mm', subject: 'Young Theo', action: 'He barely breathes holding the film.' });
    shot(7, '7A', { shotType: 'WS', lens: '24mm', move: 'Static', subject: 'Ladder at the screen tower', action: 'Maya at the top in the rain; Theo below.', notes: 'Stunt: Dani Reyes from the reach onward.' });
    shot(7, '7B', { shotType: 'MS', lens: '35mm', subject: 'The fall', action: 'Ladder skids; Maya falls onto the tarps (pads).', notes: 'STUNT. Two cameras, one take planned, a second if the coordinator agrees.', priority: 'Must Have' });
    shot(7, '7C', { shotType: 'CU', lens: '50mm', subject: 'Maya laughing in the rain', action: '"The patch held."' });
    shot(9, '9A', { shotType: 'WS', lens: '35mm', subject: 'Cruiser pulls in', action: 'Steam off the asphalt.' });
    shot(9, '9B', { shotType: 'OTS', lens: '50mm', subject: 'Dale over Theo', action: '"It\'s not a no."' });
    shot(12, '12A', { shotType: 'WS', lens: '24mm', move: 'Static', subject: 'Truck swerves', action: 'Deer (VFX) in the road; the truck spins onto the shoulder.', vfx: 'CG deer', notes: 'STUNT. Locked-off cameras; nobody near the shoulder.' });
    shot(12, '12B', { shotType: 'MCU', lens: '35mm', equipment: 'Car mount', subject: 'Driver through the windshield', action: 'Stunt driver; wipers going.' });
    shot(14, '14A', { shotType: 'MS', lens: '35mm', subject: 'June and Maya at the counter', action: '"Honey, he waved."' });
    shot(17, '17A', { shotType: '2S', lens: '35mm', subject: 'Maya and Theo thread the film', action: '"Here goes nothing." / "Here goes everything."' });
    shot(17, '17B', { shotType: 'CU', lens: '85mm', subject: 'Theo', action: 'He nods.' });
    shot(18, '18A', { shotType: 'EWS', lens: '24mm', subject: 'Beam on the screen', action: 'The wedding flickers across the patch.', vfx: 'Screen comp' });
    shot(18, '18B', { shotType: 'WS', lens: '50mm', subject: 'Headlights on the road', action: 'One car, then three, then a dozen.' });
    shot(20, '20A', { shotType: 'WS', lens: '35mm', move: 'Dolly', subject: 'The full lot', action: 'Families, June with pies, the little girl dancing with Biscuit.' });
    shot(21, '21A', { shotType: 'MS', lens: '50mm', subject: 'Dale and Maya at dawn', action: '"Permit?" "Working on it."' });

    // Storyboard frames for the stunt shots and a few others (pictures are added in the browser).
    const frame = (num: string, caption: string, n = 0): StoryboardFrame => {
      const f: StoryboardFrame = { id: newId(), shotId: ids['shot:' + num], order: n, rev: 0, caption };
      dr.storyboard.push(f);
      return f;
    };
    frame('3A', 'Headlights cut through the dust; the torn screen flaps.');
    frame('7A', 'Maya at the top of the ladder, rain starting.');
    frame('7B', 'The ladder skids…', 0);
    frame('7B', '…she falls onto the tarps (crash pads under them).', 1);
    frame('12A', 'Deer in the road; the truck swerves.', 0);
    frame('12A', 'The truck slides onto the shoulder, nose in the ditch.', 1);
    frame('18A', 'The beam hits the patched screen: the 1962 wedding.');
    frame('21A', 'Dawn. Dale, hat in hand.');
    dr.storyboardSettings = { perPage: 2, showReference: true, format: '2.39', guides: ['16:9'], guidesInPrint: true };

    // Shot Designer: the booth on Saturday night (Sc 17), feet.
    const plan = newPlan(sc(17));
    const add = (kind: Parameters<typeof newElement>[0], x: number, y: number, patch: Record<string, unknown> = {}) => { const e = { ...newElement(kind, x, y, plan), ...patch }; plan.elements.push(e as never); return e; };
    add('wall', 6, 0, { w: 12 }); add('wall', 6, 9, { w: 12 }); add('wall', 0, 4.5, { w: 9, rot: 90 }); add('wall', 12, 4.5, { w: 9, rot: 90 });
    add('window', 12, 3, { rot: 90, label: 'Porthole' });
    add('door', 2, 9, { label: 'Stairs' });
    add('prop', 9, 3, { label: 'Projector', w: 3, h: 2 });
    add('actor', 8, 5, { label: 'Maya', character: 'MAYA', rot: -45 });
    add('actor', 6.5, 3.5, { label: 'Theo (stool)', character: 'THEO', rot: 30 });
    add('camera', 3, 6, { label: 'Camera A', focal: 35, rot: -20, shotId: ids['shot:17A'] });
    add('camera', 10.5, 7, { label: 'Camera B', focal: 85, rot: -150, shotId: ids['shot:17B'] });
    add('light', 11, 1.5, { label: 'Projector spill', lightType: 'Practical', kelvin: 3200 });
    add('light', 1.5, 1.5, { label: 'Fill', lightType: 'LED panel', kelvin: 3200 });
    dr.plans = [plan];

    // A mood board (pictures are added in the browser).
    const items: BoardItem[] = [
      { id: newId(), type: 'text', x: 40, y: 20, w: 520, h: 50, z: 1, text: 'The Last Reel: look and feel' },
      { id: newId(), type: 'note', x: 40, y: 90, w: 240, h: 140, z: 2, text: 'Practical light only in the booth: the projector beam, a work lamp. Warm 3200K against blue night.', color: '#fde68a' },
      { id: newId(), type: 'note', x: 300, y: 90, w: 240, h: 140, z: 3, text: '1962 flashback: cleaner, brighter, a little more saturated. Skinny ties, cowboy hat.', color: '#bfdbfe', sceneIds: scs(5) },
      ...['#1e3a5f', '#f4a261', '#e9c46a', '#8d99ae', '#2b2d42'].map((color, i): BoardItem => ({ id: newId(), type: 'swatch', x: 40 + i * 104, y: 250, w: 96, h: 96, z: 10 + i, color })),
      { id: newId(), type: 'note', x: 580, y: 90, w: 240, h: 140, z: 4, text: 'Stunts read as real but never brutal: wide and locked-off, then the laugh.', color: '#fecaca', sceneIds: scs(7, 12) },
    ];
    const board = { id: newId(), title: 'Look book', kind: 'mood' as const, items, updatedAt: new Date().toISOString() };
    dr.boards.push(board);
    dr.bible!.boardIds = [board.id];

    // Calendar and tasks.
    const ev = (dayOffset: number, title: string, kind: Project['events'][number]['kind'], color: string, startT?: string, notes?: string) => dr.events.push({ id: newId(), date: addDays(start, dayOffset), title, kind, color, ...(startT ? { start: startT } : {}), ...(notes ? { notes } : {}) });
    ev(-14, 'Location scout: drive-in and Mill Creek Road', 'scout', '#0ea5e9', '10:00');
    ev(-10, 'Table read', 'rehearsal', '#a855f7', '18:00');
    ev(-5, 'Stunt rehearsal: ladder fall on pads', 'rehearsal', '#dc2626', '09:00', 'Lou Marsh, Dani Reyes, Nora Vance. Walk the swerve route after.');
    ev(-3, 'Camera and light prep at Big Sky Grip & Electric', 'prep', '#f59e0b', '10:00');
    ev(-2, 'Dog rehearsal with Biscuit', 'rehearsal', '#22c55e', '15:00');
    const task = (title: string, dueOffset: number, extra: Partial<Project['tasks'][number]> = {}) => dr.tasks.push({ id: newId(), title, done: false, due: addDays(start, dueOffset), order: dr.tasks.length, ...extra });
    task('Send the stunt plan to the insurer', -12, { department: 'Production', priority: 'high', assignee: 'Jordan Lee' });
    task('Road-use permit and closure for Sc 12', -10, { department: 'Locations', priority: 'high' });
    task('Get Sheriff Dale\'s (Curtis Webb) talent release signed', -1, { department: 'Production', priority: 'high' });
    task('Clear "Starlite Serenade" (sync + master)', -7, { department: 'Post-production', priority: 'high' });
    task('Replace or clear the Coca-Cola sign', -4, { department: 'Art' });
    task('Book the medic for the stunt day', -8, { department: 'Production', done: true } as never);
    task('Minor work permit for Eli Park', -6, { department: 'Production', done: true } as never);
    // The marketing & festival checklist, with the first two steps already done.
    addMarketingTasks(dr);
    for (const t of dr.tasks) if (/unit stills photographer|website \/ socials/i.test(t.title)) t.done = true;
    dr.docs.push({ id: newId(), title: 'Funding plan (sample)', updatedAt: new Date().toISOString(), doc: textDoc([
      '# Funding plan', 'A fictional plan for the sample production. Budget → Funding works out the numbers.',
      '## Where the money comes from',
      'Producer’s savings: $3,000 in the bank. In-kind: pies, coffee and Theo’s kitchen.',
      'Ridgeview County Arts Council grant: $2,500 applied for.',
      'Seed&Spark campaign: rewards kept mostly digital so fees and fulfilment stay low; it funds at 80% of the goal.',
      '## Not counting on',
      'Montana’s MEDIA tax credit: no credit available for productions filming after 2024 (checked October 2026).',
      '## Marketing',
      'Unit stills on the stunt day and the crowd night; key art; trailer cut in post; 12 festival submissions, early deadlines first.',
    ]) });
  });

  // ---------------------------------------------------------------- Paperwork, budget, money
  d = derive(p.scriptDoc, p.sceneNumbersLocked);
  p = produce(p, (dr) => {
    const P = dr as Project;
    const facts = breakdownFacts(P, d);
    dr.budget.fringes = [
      { id: 'fr-payroll', name: 'Payroll taxes & fees', pct: 12 },
      { id: 'fr-ph', name: `SAG-AFTRA pension & health (UPA ${UPA_PH}%)`, pct: UPA_PH },
    ];
    dr.budget.lines.push(...importFromBreakdown(P, facts));
    dr.budget.contingencyPct = 10;
    dr.budget.notes = `Sample numbers. SAG-AFTRA Ultra Low Budget Project (UPA): day performer $${UPA_DAY} from 7/1/2026, P&H ${UPA_PH}%, daily stunt coordinator $${STUNT_COORD_DAY.toLocaleString('en-US')}; checked on sagaftra.org ${SAMPLE_RATES_CHECKED}. Check the current rate sheet before you budget your own film.`;

    const doc = (kind: PaperKind, person: PersonRef, status: PaperDoc['status'], extra: Partial<PaperDoc> = {}) => {
      const x = { ...newDoc(P, kind, person), status, ...extra };
      if (status === 'signed' && kind !== 'deal') x.signature = { name: person.kind === 'cast' ? P.cast.find((c) => c.id === person.id)?.actorName ?? '' : '', at: new Date().toISOString() };
      dr.budget.paperwork ??= [];
      dr.budget.paperwork.push(x);
      return x;
    };
    const deal = (person: PersonRef, terms: DealTerms, status: PaperDoc['status'] = 'signed', notes?: string) => doc('deal', person, status, { deal: terms, ...(notes ? { notes } : {}) });
    const castRef = (ch: string): PersonRef => ({ kind: 'cast', id: ids[ch] });
    const crewRef = (role: string): PersonRef => ({ kind: 'crew', id: ids[role] });
    for (const ch of ['MAYA', 'THEO', 'SHERIFF DALE', 'JUNE', 'WALTER', 'YOUNG THEO']) deal(castRef(ch), { rate: UPA_DAY, per: 'day' });
    deal(castRef('MAYA (STUNT DOUBLE)'), { rate: UPA_DAY, per: 'day' }, 'signed', 'UPA day performer minimum. Stunt adjustment for the ladder fall agreed on the day with the coordinator.');
    deal(castRef('STUNT DRIVER'), { rate: UPA_DAY, per: 'day' }, 'signed', 'UPA day performer minimum. Stunt adjustment for the swerve agreed on the day with the coordinator.');
    for (const ch of ['MAYA', 'THEO', 'JUNE', 'WALTER', 'YOUNG THEO', 'MAYA (STUNT DOUBLE)', 'STUNT DRIVER']) doc('talent', castRef(ch), 'signed');
    doc('talent', castRef('SHERIFF DALE'), 'sent', { notes: 'Sent, not back yet: the call sheets will warn.' });
    doc('minor', castRef('YOUNG THEO'), 'received', { expires: addDays(start, 120), where: 'Production binder', notes: 'Montana child performer rules: a parent on set; hours limits.' });
    doc('other', castRef('MAYA (STUNT DOUBLE)'), 'signed', { title: 'Stunt plan sign-off — ladder fall (Sc 7)', body: 'Stunt: a fall of about 10 ft from a ladder onto crash pads hidden under tarps.\nRehearsed on pads before the shoot day. The stunt coordinator has final say; the performer may stop at any time.\nMedic on set. No rain on the landing area during the take.' });
    doc('other', castRef('STUNT DRIVER'), 'signed', { title: 'Stunt plan sign-off — truck swerve (Sc 12)', body: 'Stunt: a controlled swerve and slide on a closed, wetted county road at under 25 mph.\nThe road is closed by the sheriff\'s office; cameras locked off; no one in the truck bed or on the shoulder.\nThe stunt coordinator has final say.' });

    deal(crewRef('Director of photography (DP)'), { rate: 900, per: 'flat', kitFee: 50, kitPer: 'day', guaranteedDays: 4, contractor: true });
    deal(crewRef('1st assistant director (1st AD)'), { rate: 125, per: 'day', otAfter: 10, otMult: 1.5, contractor: true });
    deal(crewRef('Gaffer'), { rate: 125, per: 'day', contractor: true });
    deal(crewRef('Production sound mixer'), { rate: 175, per: 'day', kitFee: 40, kitPer: 'day', contractor: true });
    deal(crewRef('Production assistant (PA)'), { rate: 100, per: 'day', contractor: true });
    deal(crewRef('Stunt coordinator'), { rate: STUNT_COORD_DAY, per: 'flat', guaranteedDays: 1 }, 'signed', `UPA daily stunt coordinator, $${STUNT_COORD_DAY.toLocaleString('en-US')} for Day 1 (both stunts). Crash pads included.`);
    deal(crewRef('Animal trainer'), { rate: 450, per: 'flat', contractor: true }, 'signed', 'Biscuit and handler, 3 days, as a flat.');
    for (const role of ['Director', 'Producer', '1st assistant director (1st AD)', 'Director of photography (DP)', 'Gaffer', 'Production sound mixer', 'Production assistant (PA)', 'Stunt coordinator', 'Animal trainer']) doc('crew', crewRef(role), 'signed');
    doc('w9', crewRef('Animal trainer'), 'received', { where: 'Production binder' });
    const driveInRelease = doc('location', { kind: 'location', id: ids['loc:drive-in'] }, 'signed');
    const roadRelease = doc('location', { kind: 'location', id: ids['loc:road'] }, 'sent', { notes: 'With the county permit desk.' });
    doc('location', { kind: 'location', id: ids['loc:kitchen'] }, 'signed');
    syncPaperworkLines(dr);

    // Stunt performers' lines belong in Stunts; the coordinator is already there by role.
    for (const l of dr.budget.lines) if (l.link?.kind === 'cast' && (l.link.id === ids['MAYA (STUNT DOUBLE)'] || l.link.id === ids['STUNT DRIVER'])) l.accountId = 'acc-3300';
    // Union performers get P&H; performers (employees, through a payroll service) get payroll fees.
    // Crew here are contractors (1099), so no payroll fees on their lines.
    const union = new Set(dr.cast.filter((c) => c.union === 'SAG-AFTRA').map((c) => c.id).concat(ids['Stunt coordinator']));
    for (const l of dr.budget.lines) {
      if ((l.link?.kind === 'cast' || l.link?.kind === 'crew') && l.link.id && union.has(l.link.id) && !l.fringeIds.includes('fr-ph')) l.fringeIds.push('fr-ph');
      if ((l.link?.kind === 'cast' || (l.link?.kind === 'crew' && l.link.id === ids['Stunt coordinator'])) && !l.fringeIds.includes('fr-payroll')) l.fringeIds.push('fr-payroll');
    }
    // Rates on the breakdown lines.
    const rate = (name: string, r: number, notes?: string) => { const e = dr.elements.find((x) => x.name === name); const l = e && dr.budget.lines.find((x) => x.link?.kind === 'element' && x.link.id === e.id); if (l) { l.rate = r; if (notes) l.notes = notes; } };
    rate('Film canister', 40); rate('Flashlight, cane and thermos (Theo)', 25); rate('35mm projector', 0, 'Borrowed from the Ridgeview historical society.');
    rate('Splicer and xenon lamp', 60); rate('Staple gun and screen vinyl', 85); rate('First-aid kit', 15); rate('Flyers', 30); rate('Cherry pies', 60); rate('Wall phone', 20);
    rate('1978 pickup truck (picture car)', 0, 'Producer\'s own truck: fuel and a mechanic check under Transportation.');
    rate('Sheriff\'s cruiser', 60); rate('Background cars (12)', 0, 'Volunteers; gas cards under Extras.');
    rate('Biscuit the dog', 0, 'Paid through the animal trainer\'s deal.');
    rate('Moviegoers (30 adults, families)', 0, 'Volunteers: fed and thanked in the credits.'); rate('Little girl (7) in pyjamas', 0, 'A volunteer\'s daughter, with her parent on set.');
    rate('Ladder fall (Maya)', 0, 'Performer and coordinator are on their own lines; this is for rigging if needed.');
    rate('Truck swerve and slide (Maya driving)', 0, 'Performer and coordinator are on their own lines; the road closure is under Security.');
    rate('Crash pads', 0, 'Included in the stunt coordinator\'s deal.');
    rate('Rain (rain towers / water truck)', 350, 'Volunteer fire department water truck: a donation.');
    rate('Steam off the asphalt', 20); rate('1962 period wardrobe (Walter, Young Theo)', 120); rate('Sheriff\'s uniform and reflective vest', 60);
    rate('Maya\'s rain-soaked doubles (x3)', 90); rate('Wrist bandage (continuity from Sc 8)', 15);
    rate('Wedding film on the patched screen (comp)', 200); rate('CG deer', 250);
    rate('"Starlite Serenade" — The Velvet Hours (fictional)', 0, 'The licence is its own line (Budget → Licenses).');
    rate('Coca-Cola sign and FOR SALE board', 40); rate('"OPEN SATURDAYS" sign', 35); rate('Snack bar menu boards (1960s prices)', 40);
    rate('Traffic control and road closure', 75, 'Off-duty deputy for the road closure; vests for the lot.');
    const head = dr.budget.lines.find((l) => l.link?.kind === 'headcount'); if (head) head.rate = 14;
    // Deliberate $0s say why, so "Quick estimate" leaves them alone; holds are paid under UPA.
    const crewLine = (role: string) => dr.budget.lines.find((l) => l.link?.kind === 'crew' && l.link.id === ids[role]);
    for (const role of ['Director', 'Producer']) { const l = crewLine(role); if (l) l.notes = 'Deferred: the director and producer aren’t paid on this short.'; }
    const kitchen = dr.budget.lines.find((l) => l.link?.kind === 'location' && l.link.id === ids['loc:kitchen']); if (kitchen) kitchen.notes = 'Free: a thank-you credit.';
    for (const l of dr.budget.lines) if (l.link?.kind === 'castHold' && !l.rate) { l.rate = UPA_DAY; l.notes = 'Hold days are paid at the day rate under UPA.'; }
    const add = (accountId: string, description: string, units: BudgetLine['units'], qty: number, r: number, notes?: string) => dr.budget.lines.push({ id: newId(), accountId, description, qty, units, x: 1, rate: r, fringeIds: [], ...(notes ? { notes } : {}) });
    add('acc-3400', 'Fuel, mechanic check (picture truck)', 'allow', 1, 120);
    add('acc-5200', 'Legal & accounting', 'allow', 1, 400, 'Chain-of-title review, the LLC, bookkeeping.');
    add('acc-2100', 'Gas cards for background cars', 'each', 12, 10);
    add('acc-3300', 'Set medic (stunt day)', 'days', 1, 300, 'Ridgeview Ambulance standby.');
    add('acc-2900', 'Portable toilets (2) and generator fuel', 'allow', 1, 180);
    add('acc-3600', 'Production insurance (short-term, with stunts rider)', 'flat', 1, 450, 'Stunts raise the premium: tell the insurer early.');

    // Gear: an owned camera kit, rented lights, a bought lens adapter.
    dr.gear = [
      { id: newId(), name: 'Sony a7S III kit (camera, 3 lenses, media)', category: 'camera', qty: 1, source: 'own', rate: 0, rateUnit: 'day', sceneIds: [], notes: 'The DP\'s own kit (kit fee on her deal).' },
      { id: newId(), name: '2× LED panel kit + stands', category: 'lighting', qty: 2, source: 'rent', rate: 45, rateUnit: 'day', sceneIds: [], notes: 'Big Sky Grip & Electric.' },
      { id: newId(), name: 'Honda 2200W generator', category: 'power', qty: 1, source: 'rent', rate: 40, rateUnit: 'day', sceneIds: scs(3, 4, 5, 6, 7, 8, 9, 16, 17, 18, 19, 20, 21) },
      { id: newId(), name: 'Car mount (suction)', category: 'grip', qty: 1, source: 'rent', rate: 35, rateUnit: 'day', sceneIds: scs(2, 11, 12) },
      { id: newId(), name: 'EF→E lens adapter', category: 'lens', qty: 1, source: 'buy', rate: 129, rateUnit: 'day', sceneIds: [], notes: 'For the borrowed vintage lenses.' },
    ];
    syncPlanGear(dr);
    syncGearLines(dr);

    // The song: requested, not licensed yet.
    const song = { ...newLicense('music'), title: 'Starlite Serenade', performer: 'The Velvet Hours (fictional band)', writers: 'R. Calloway, M. Dunne (fictional)', publisher: 'Prairie Sky Music (fictional)', label: 'Lantern Records (fictional)', licenseType: 'Sync + master', media: 'Festivals and online', territory: 'Worldwide', term: '5 years', fee: 350, status: 'requested' as const, sceneIds: scs(2, 19), useType: 'Source (radio)', inCredits: true, notes: 'Quote requested; not cleared. Have a sound-alike ready.' };
    dr.budget.licenses.push(song);
    syncLicenseLines(dr);

    // Clearances: scan, then where each stands.
    applyScan(dr, scanScript(P, d));
    const locOf = (key: string) => dr.locations.find((l) => l.id === ids[key])!;
    setLocationClearance(dr, locOf('loc:drive-in'), [], { status: 'cleared', docId: driveInRelease.id });
    setLocationClearance(dr, locOf('loc:road'), [], { status: 'requested', docId: roadRelease.id });
    setLocationClearance(dr, locOf('loc:kitchen'), [], { status: 'cleared' });
    setLocationClearance(dr, locOf('loc:diner'), [], { status: 'needed', notes: 'New in the production draft: no release yet.' });
    const cl = (pred: (c: Clearance) => boolean, patch: Partial<Clearance>) => { for (const c of dr.budget.clearances ?? []) if (pred(c)) Object.assign(c, patch); };
    cl((c) => c.kind === 'phone', { status: 'cleared', notes: '555-01xx numbers are reserved for fiction.' });
    cl((c) => c.kind === 'logo', { status: 'replace', notes: 'Art department: a made-up cola sign, or a letter from the brand.' });
    cl((c) => c.kind === 'name', { status: 'cleared', notes: 'Checked: no real person in Ridgeview by this name.' });
    cl((c) => c.kind === 'artwork' && /OPEN SATURDAYS/.test(c.item), { status: 'na', notes: 'Our own sign, painted by the art department.' });
    (dr.budget.clearances ??= []).push({ id: newId(), kind: 'music', item: '"Starlite Serenade" — The Velvet Hours', sceneIds: scs(2, 19), status: 'requested', source: 'manual', notes: 'Licence requested (Budget → Licenses). Not cleared yet.' });

    // Expenses so far (no receipt files in the sample).
    const acc = (code: string) => dr.budget.accounts.find((a) => a.code === code)?.id ?? dr.budget.accounts[0].id;
    dr.budget.expenses.push(
      { id: newId(), date: addDays(start, -9), vendor: 'Ridgeview Hardware', description: 'Screen vinyl, staple gun, tarps', amount: 92.4, accountId: acc('2500'), paid: true, method: 'Card' },
      { id: newId(), date: addDays(start, -3), vendor: 'Big Sky Grip & Electric', description: 'Deposit: LED kits and generator', amount: 150, accountId: acc('2300'), paid: true, method: 'Card' },
    );

    // Marketing & festivals (5100): budgeted from day one, some of it during the shoot.
    const mk = missingMarketingLines(dr.budget.accounts as never, dr.budget.lines as never);
    const mrate: Record<string, [number, string?]> = {
      'Unit stills photographer': [200, 'Two days: the stunt day and the crowd night.'],
      'Behind the scenes / EPK': [0, 'The PA shoots BTS on a phone gimbal.'],
      'Key art / poster': [250],
      'Trailer edit': [0, 'Cut by the editor as part of post.'],
      'Website, domain & socials': [60],
      'Paid social ads': [150, 'Boost the trailer around the premiere.'],
      'Press kit': [0, 'Written by the producer.'],
      'Festival submissions': [45, '12 festivals at about $45 each (FilmFreeway; early deadlines cheaper).'],
      'DCP & screening copies': [150],
      'Festival travel': [400],
      'Publicist (optional)': [0, 'Not for this short.'],
    };
    for (const l of mk) { const r = mrate[l.description]; if (r) { l.rate = r[0]; if (r[1]) l.notes = r[1]; } if (l.description === 'Festival submissions') l.qty = 12; }
    dr.budget.lines.push(...mk);

    // Funding: what's in hand, what's promised, what's hoped for, and the crowdfunding plan.
    dr.budget.fundingSources = [
      { id: newId(), kind: 'cash', name: 'Producer’s savings (Jordan Lee)', amount: 3000, status: 'received' },
      { id: newId(), kind: 'inkind', name: 'Pies and coffee from Rosie’s Diner; Theo’s kitchen', amount: 300, status: 'pledged', notes: 'Value of what’s given, so the budget still shows it.' },
      { id: newId(), kind: 'grant', name: 'Ridgeview County Arts Council (fictional)', amount: 2500, status: 'applied', date: addDays(start, -20), notes: 'Decision expected three weeks before the shoot.' },
      { id: newId(), kind: 'crowdfunding', name: 'Seed&Spark campaign (net, pledged so far)', amount: 4000, status: 'pledged', notes: 'Goal set with Budget → Funding: rewards are mostly digital.' },
      { id: newId(), kind: 'incentive', name: 'Montana MEDIA tax credit', amount: 0, status: 'idea', notes: `Checked ${SAMPLE_RATES_CHECKED}: the state says no credit is available for productions filming after 2024. Listed so nobody counts on it.` },
    ];
    dr.budget.funding = {
      pagesPerDay: 3, level: 'indie',
      crowd: {
        platform: 'seedandspark', feePct: 0, processingPct: 2.9, perPledge: 0.3, pledgeMgrPct: 0, taxReservePct: 5, noRewardPct: 15,
        tiers: [
          { id: newId(), name: 'Thank you + private stream link', price: 15, backers: 80, costEach: 0, shipEach: 0 },
          { id: newId(), name: 'Digital script + production diary', price: 35, backers: 50, costEach: 0, shipEach: 0 },
          { id: newId(), name: 'Signed poster', price: 75, backers: 25, costEach: 11, shipEach: 12 },
          { id: newId(), name: 'Special thanks credit', price: 100, backers: 15, costEach: 0, shipEach: 0 },
          { id: newId(), name: 'Your name on a drive-in speaker post', price: 250, backers: 6, costEach: 8, shipEach: 0 },
          { id: newId(), name: 'Night-shoot visit + pie', price: 500, backers: 2, costEach: 25, shipEach: 0 },
        ],
      },
    };

    // Festivals (all fictional), timed from picture lock about 12 weeks after the shoot.
    const lock = addDays(start, 7 + 84);
    const fest = (name: string, tier: Festival['tier'], premiere: Festival['premiere'], eventIn: number, deadlines: [string, number, number][], extra: Partial<Festival> = {}): Festival => {
      const dls = deadlines.map(([label, inDays, fee]) => ({ id: newId(), label, date: addDays(lock, inDays), fee }));
      return { id: newId(), name, platform: 'filmfreeway', tier, premiere, status: 'planned', eventStart: addDays(lock, eventIn), eventEnd: addDays(lock, eventIn + 4), deadlines: dls, aim: dls[0].id, category: 'Narrative short', ...extra };
    };
    dr.budget.festivals = [
      fest('Northern Lights International Film Festival (fictional)', 'top', 'world', 210, [['Earlybird', 30, 50], ['Regular', 60, 65], ['Late', 90, 80]], { location: 'Calgary, AB (fictional)', notes: 'Wants a world premiere: hold the film back from earlier festivals if we get in.' }),
      fest('Prairie Light Film Festival (fictional)', 'local', 'none', 120, [['Earlybird', 21, 25], ['Regular', 50, 35]], { location: 'Billings, MT (fictional)', attend: true, travel: 250 }),
      fest('Big Sky Indie Shorts (fictional)', 'target', 'regional', 160, [['Regular', 35, 40], ['Late', 70, 55]], { location: 'Missoula, MT (fictional)' }),
      fest('Drive-In Shorts Night (fictional)', 'local', 'none', 140, [['Regular', 40, 0]], { location: 'Rapid City, SD (fictional)', notes: 'Free to enter.' }),
      fest('Coastline Film Week (fictional)', 'target', 'national', 240, [['Earlybird', 45, 45], ['Regular', 80, 60]], { location: 'Portland, OR (fictional)', waiver: 'Fee waiver for first-time filmmakers (apply by email)' }),
      fest('Silver Reel Awards (fictional)', 'long-shot', 'none', 200, [['Regular', 55, 75]], { status: 'considering', location: 'Online' }),
      fest('Hometown Screens (fictional)', 'local', 'none', 100, [['Regular', 20, 20]], { status: 'considering', location: 'Ridgeview, MT (fictional)' }),
    ];
    syncFestivalLines(dr, todayISO());

    // Two versions to compare: as budgeted (Ultra Low, UPA) and Micro-Budget.
    const castLines = dr.budget.lines.filter((l) => l.link?.kind === 'cast');
    const stuntLines = dr.budget.lines.filter((l) => l.accountId === 'acc-3300');
    dr.budget.scenarios = [
      { id: newId(), name: 'Ultra Low Project (UPA), as budgeted', overrides: {}, added: [] },
      {
        id: newId(),
        name: 'Micro-Budget Project: no stunts allowed',
        overrides: Object.fromEntries([
          ...castLines.map((l) => [l.id, { rate: 150 }] as const),
          ...stuntLines.map((l) => [l.id, { removed: true }] as const),
        ]),
        added: [],
      },
    ];

    // Time cards for Day 1 (the stunt day). The stunt coordinator's 05:45 call puts lunch more than
    // six hours in, and he stays late for the swerve: two meal penalties on one card.
    const day1 = dr.schedule.days.find((x) => x.id === shootDays[0].id)!;
    dr.budget.payrollRules = { otAfter: 8, dtAfter: 12, mealEvery: 6, mealPenalty: 25 };
    dr.budget.timecards = cardsFromCallSheet(P, d, day1 as never);
    const stuntCard = dr.budget.timecards.find((c) => c.person.kind === 'crew' && c.person.id === ids['Stunt coordinator']);
    if (stuntCard) Object.assign(stuntCard, { out: '19:00', notes: 'Called early to rig the pads; stayed for the swerve.' });
  });

  // The target: a little above the total, as a cap the budget screens can warn against.
  return produce(p, (dr) => { dr.budget.targetTotal = sampleTarget(dr as Project); });
}

/** The budget total rounded up to the next $1,000, plus $1,000 of headroom. */
function sampleTarget(p: Project): number {
  const v = budgetView(p, derive(p.scriptDoc, p.sceneNumbersLocked));
  return Math.ceil(totals(p.budget, v.lines).total / 1000) * 1000 + 1000;
}

/** Shoot days (with scenes) in order: handy for tests. */
export function sampleShootDays(p: Project) {
  return p.schedule.days.filter((x) => x.items.some((i) => i.kind === 'scene'));
}
