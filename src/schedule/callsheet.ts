import type { CallSheet, CallSheetInfoRow, CallSheetLocation, CallSheetSection, CastCall, CrewCall, DerivedScene, Location, Project, ShootDay } from '../model/types';
import { newId } from '../model/ids';
import { formatClock12, fromISO, parseClock, toClock } from '../model/dates';
import { sceneCast, sceneEighths, sceneTime, type Derived } from '../script/derive';
import { cascade, dayNumbers, dayTotals } from './engine';
import { buildDood, doodCodeFor, type Dood } from './dood';

// Call sheets, after CineSched's CallSheetEditor (populateFields / populateCastFromScenes /
// populateCrewFromProductionInfo). Autofill only ever adds rows and fills blanks, so it is
// safe to re-run after the schedule changes without losing anything typed by hand.

export function emptyCallSheet(): CallSheet {
  return {
    workDaySchedule: '', quote: '', snack: '', dinner: '',
    weatherTemp: '', weatherCondition: '', weatherPrecipWind: '', sunTimes: '', coords: '',
    basecamp: '', nearestHospital: '',
    locations: [], cast: [], crew: [], notes: '',
  };
}

/** The roster location for a scene: explicit link in the breakdown, else matching set name. */
export function sceneLocation(p: Project, s: DerivedScene): Location | undefined {
  const id = p.sceneMeta[s.id]?.locationId;
  if (id) {
    const l = p.locations.find((x) => x.id === id);
    if (l) return l;
  }
  const set = s.set.trim().toUpperCase();
  return set ? p.locations.find((l) => l.setName.trim().toUpperCase() === set) : undefined;
}

export function dayScenes(d: Derived, day: ShootDay): DerivedScene[] {
  return day.items.flatMap((i) => (i.kind === 'scene' && d.sceneById.has(i.sceneId) ? [d.sceneById.get(i.sceneId)!] : []));
}

const locName = (l: Location) => l.realName.trim() || l.setName.trim();
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Fills a call sheet from the day's strips, the cast roster, daily crew and locations. */
export function autofillCallSheet(p: Project, d: Derived, day: ShootDay, existing?: CallSheet): CallSheet {
  const cs: CallSheet = existing ? structuredCloneSheet(existing) : emptyCallSheet();
  const scenes = dayScenes(d, day);

  // Locations: one per distinct real location among today's scenes.
  for (const sc of scenes) {
    const l = sceneLocation(p, sc);
    const name = l ? locName(l) : '';
    if (!name) continue;
    const hit = cs.locations.find((x) => same(x.name, name));
    if (!hit) cs.locations.push({ id: newId(), name, address: l!.address });
    else if (!hit.address.trim()) hit.address = l!.address;
  }
  if (!cs.locations.length && !existing && p.locations.length === 1) {
    const l = p.locations[0];
    if (locName(l)) cs.locations.push({ id: newId(), name: locName(l), address: l.address });
  }

  // Cast: everyone in today's scenes, roster order first.
  const chars: string[] = [];
  for (const sc of scenes) for (const c of sceneCast(p, sc)) if (!chars.includes(c)) chars.push(c);
  const num = (c: string) => p.cast.find((m) => m.characterName.toUpperCase() === c)?.castNumber ?? Infinity;
  chars.sort((a, b) => num(a) - num(b) || a.localeCompare(b));
  for (const c of chars) {
    const m = p.cast.find((x) => x.characterName.toUpperCase() === c);
    const hit = cs.cast.find((x) => same(x.characterName, c));
    if (hit) {
      if (!hit.actorName.trim() && m?.actorName) hit.actorName = m.actorName;
      continue;
    }
    cs.cast.push({ id: newId(), characterName: c, actorName: m?.actorName ?? '', sceneNumbers: '', status: '', pickup: '', hmu: '', onSet: '', wrap: '', loc: '' });
  }

  // Crew: daily-default crew from Setup. Fill blank names / phones on matching roles.
  for (const m of p.crew) {
    const hit = cs.crew.find((x) => (x.crewId && x.crewId === m.id) || (same(x.role, m.role) && (!x.name.trim() || same(x.name, m.name))));
    if (hit) {
      if (!hit.name.trim()) hit.name = m.name;
      if (!hit.phone.trim() && m.phone) hit.phone = m.phone;
      hit.crewId ??= m.id;
      continue;
    }
    if (m.dailyDefault) cs.crew.push({ id: newId(), crewId: m.id, role: m.role, name: m.name, call: '', phone: m.phone ?? '' });
  }
  // A brand-new sheet with no crew list starts with the usual key positions to fill in.
  if (!existing && !cs.crew.length) {
    const pr = p.production;
    const known: Record<string, string> = { Producer: pr.producer, Director: pr.director, '1st AD': pr.ad };
    for (const role of ['Producer', 'Director', '1st AD', 'Production Manager', 'Director of Photography', 'Camera Operator', 'Gaffer', 'Key Grip', 'Sound Mixer']) {
      cs.crew.push({ id: newId(), role, name: known[role] ?? '', call: '', phone: '', email: '' });
    }
  }
  return ensureLayout(p, day, cs);
}

// ---- Page layout ----

export const SECTION_LABELS: Record<CallSheetSection['kind'], string> = {
  scenes: 'Scenes', cast: 'Cast', crew: 'Crew', notes: 'Production notes', locations: 'Locations', advance: 'Advance schedule', table: 'Custom table', bts: 'BTS & stills',
};

export function defaultSections(): CallSheetSection[] {
  return [
    { id: newId(), kind: 'scenes', title: 'Scenes' },
    { id: newId(), kind: 'cast', title: 'Cast' },
    { id: newId(), kind: 'notes', title: 'Production notes', text: '' },
    { id: newId(), kind: 'crew', title: 'Crew' },
  ];
}

/** Ready-made sections for "Add section". */
export const SECTION_TEMPLATES: { label: string; make: () => CallSheetSection }[] = [
  { label: 'Locations table', make: () => ({ id: newId(), kind: 'locations', title: 'Locations' }) },
  { label: 'Advance schedule (next shoot day)', make: () => ({ id: newId(), kind: 'advance', title: 'Advance schedule' }) },
  { label: 'Notes box', make: () => ({ id: newId(), kind: 'notes', title: 'Notes', text: '' }) },
  { label: 'BTS & stills to get (Release → Social)', make: () => ({ id: newId(), kind: 'bts', title: 'BTS & stills', text: '' }) },
  { label: 'Walkie channels', make: () => table('Walkie channels', ['Channel', 'Department'], [['1', 'Production'], ['2', 'Open / chat'], ['3', 'Camera'], ['4', 'Grip & Electric']]) },
  { label: 'Background / extras', make: () => table('Background', ['Description', 'Qty', 'Call time', 'Wardrobe / notes'], [['', '', '', '']]) },
  { label: 'Vendors & deliveries', make: () => table('Vendors & deliveries', ['Vendor', 'Item', 'Time', 'Contact', 'Phone'], [['', '', '', '', '']]) },
  { label: 'Transportation', make: () => table('Transportation', ['Vehicle', 'Driver', 'Pick up', 'From', 'To'], [['', '', '', '', '']]) },
  { label: 'Special equipment', make: () => table('Special equipment', ['Item', 'Department', 'Qty', 'Notes'], [['', '', '', '']]) },
  { label: 'Blank table', make: () => table('New section', ['Column 1', 'Column 2', 'Column 3'], [['', '', '']]) },
];

function table(title: string, columns: string[], rows: string[][]): CallSheetSection {
  return { id: newId(), kind: 'table', title, columns, rows: rows.map((cells) => ({ id: newId(), cells })) };
}

/** Fills page-layout fields missing from a sheet (new sheets, and sheets saved before the layout existed). */
export function ensureLayout(p: Project, day: ShootDay, cs: CallSheet): CallSheet {
  const n = dayNumbers(p.schedule).get(day.id);
  const prod = p.production;
  const out: CallSheet = { ...cs };
  out.fileName ??= `Call sheet${n ? ` – Day ${n}` : ''}`;
  out.productionTitle ??= p.title;
  out.companyInfo ??= [prod.company, prod.contactPhone].filter(Boolean).join('\n');
  out.keyContacts ??= ([['Producer', prod.producer], ['Director', prod.director], ['1st AD', prod.ad]] as const)
    .map(([role, name]) => {
      const crew = p.crew.find((c) => c.name && c.name === name);
      return { id: newId(), role, name, phone: crew?.phone ?? '' };
    });
  out.infoRows ??= defaultInfoRows();
  out.sections ??= defaultSections();
  out.sceneNotes ??= {};
  out.extraScenes ??= [];
  out.topNotes ??= '';
  return out;
}

export function defaultInfoRows(): CallSheetInfoRow[] {
  return [
    { id: newId(), label: 'Breakfast', value: '' },
    { id: newId(), label: 'Shooting call', value: '', bind: 'readyToShoot' },
    { id: newId(), label: 'Lunch', value: '', bind: 'lunch' },
    { id: newId(), label: 'Sunrise', value: '', bind: 'sunrise' },
    { id: newId(), label: 'Sunset', value: '', bind: 'sunset' },
    { id: newId(), label: 'Weather', value: '', bind: 'weather' },
    { id: newId(), label: 'Est. wrap', value: '', bind: 'wrap' },
  ];
}

/** Value shown for an info row: what was typed, else the live value it's bound to. */
export function infoValue(row: CallSheetInfoRow, r: ResolvedCallSheet, day: ShootDay): string {
  if (row.value.trim()) return row.value;
  const c = r.clock;
  const s = r.sheet;
  const clock = (m: number | null) => (m === null ? '' : formatClock12(m));
  switch (row.bind) {
    case 'lunch': return clock(c.lunch);
    case 'wrap': return clock(c.wrap);
    case 'readyToShoot': return clock(c.readyToShoot);
    case 'weather': return [s.weatherTemp, s.weatherCondition, s.weatherPrecipWind].filter(Boolean).join(', ');
    case 'sunrise':
    case 'sunset': {
      const co = parseCoords(s.coords);
      if (co) {
        const t = sunriseSunset(day.date, co.lat, co.lon);
        return clock(row.bind === 'sunrise' ? t.sunrise : t.sunset);
      }
      const m = s.sunTimes.match(row.bind === 'sunrise' ? /sunrise\s*([\d:]+\s*[AP]M)/i : /sunset\s*([\d:]+\s*[AP]M)/i);
      return m ? m[1] : '';
    }
    default: return '';
  }
}

/**
 * Behind-the-scenes photos and clips to get today: what you typed (one per line), plus Social posts
 * planned for this day that aren't posted yet.
 */
export function btsItems(p: Project, day: ShootDay, sec: CallSheetSection): { what: string; why: string }[] {
  const typed = (sec.text ?? '').split('\n').map((x) => x.trim()).filter(Boolean).map((what) => ({ what, why: '' }));
  const posts = (p.socialPosts ?? []).filter((x) => x.date === day.date && x.status !== 'posted')
    .map((x) => ({ what: x.caption.split('\n')[0].slice(0, 90) || x.milestone || 'Social post', why: ['Social', x.milestone].filter(Boolean).join(': ') }));
  return [...typed, ...posts];
}

/** Next shoot day's scenes, for the advance schedule section. */
export function advanceSchedule(p: Project, d: Derived, day: ShootDay): { day: ShootDay; number: number; scenes: DerivedScene[] } | null {
  const nums = dayNumbers(p.schedule);
  const next = p.schedule.days.find((x) => x.date > day.date && nums.has(x.id));
  return next ? { day: next, number: nums.get(next.id)!, scenes: dayScenes(d, next) } : null;
}

/** "TOMORROW" / "TODAY" / weekday, relative to the real date. */
export function callDayLabel(iso: string, today = new Date()): string {
  const d0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diff = Math.round((fromISO(iso).getTime() - d0) / 86400000);
  if (diff === 0) return 'TODAY';
  if (diff === 1) return 'TOMORROW';
  return fromISO(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();
}

function structuredCloneSheet(c: CallSheet): CallSheet {
  return {
    ...emptyCallSheet(), ...c,
    locations: c.locations.map((x) => ({ ...x })),
    cast: c.cast.map((x) => ({ ...x })),
    crew: c.crew.map((x) => ({ ...x })),
    keyContacts: c.keyContacts?.map((x) => ({ ...x })),
    infoRows: c.infoRows?.map((x) => ({ ...x })),
    sections: c.sections?.map((x) => ({ ...x, columns: x.columns && [...x.columns], rows: x.rows?.map((r) => ({ ...r, cells: [...r.cells] })) })),
    sceneNotes: c.sceneNotes && { ...c.sceneNotes },
    extraScenes: c.extraScenes?.map((x) => ({ ...x })),
  };
}

export interface DayClock {
  generalCall: number | null;
  readyToShoot: number | null;
  lunch: number | null;
  wrap: number | null;
}

/** Effective times: day.times overrides, else the timeline (meal banner, last strip), else production defaults. */
export function dayClock(p: Project, d: Derived, day: ShootDay): DayClock {
  const generalCall = parseClock(day.times.generalCall) ?? parseClock(p.production.defaultCall);
  const readyToShoot = parseClock(day.times.readyToShoot);
  const timed = cascade(p, d, day);
  const meal = timed.find((t) => t.item.kind === 'banner' && t.item.bannerKind === 'meal' && (t.item.meal ?? 'lunch') === 'lunch');
  const lunch = parseClock(day.times.lunch) ?? (meal ? meal.start : parseClock(p.production.defaultLunch));
  const wrap = dayTotals(p, d, day).wrap;
  return { generalCall, readyToShoot, lunch, wrap };
}

export interface CallSheetSceneRow {
  scene: DerivedScene;
  number: string;
  intExt: string;
  time: string;
  set: string;
  synopsis: string;
  cast: string; // cast numbers (or names)
  eighths: number;
  loc: string; // 1-based location number on the sheet
  address: string;
}

export interface ResolvedCastCall extends CastCall {
  inToday: boolean;
  castNumber?: number;
}

export interface ResolvedCallSheet {
  sheet: CallSheet;
  stored: boolean;
  dayNumber?: number;
  totalDays: number;
  clock: DayClock;
  scenes: CallSheetSceneRow[];
  totalEighths: number;
  cast: ResolvedCastCall[];
  crew: CrewCall[];
  locations: CallSheetLocation[];
  /** Characters in today's scenes that have no row (schedule changed since the sheet was saved). */
  missingCast: string[];
}

/** Everything the editor and the PDF show: the stored (or autofilled) sheet with blanks resolved to live values. */
export function resolveCallSheet(p: Project, d: Derived, day: ShootDay, dood: Dood = buildDood(p, d)): ResolvedCallSheet {
  const stored = p.callSheets[day.id];
  // A stored sheet is shown as the user left it (deleted rows stay deleted); "Refresh" re-runs autofill.
  const sheet = stored ? ensureLayout(p, day, { ...emptyCallSheet(), ...stored }) : autofillCallSheet(p, d, day);
  const nums = dayNumbers(p.schedule);
  const clock = dayClock(p, d, day);
  const scenes = dayScenes(d, day);
  const locs = sheet.locations;
  const locIndexFor = (sc: DerivedScene) => {
    const l = sceneLocation(p, sc);
    const i = l ? locs.findIndex((x) => same(x.name, locName(l))) : -1;
    return i;
  };
  const sceneRows: CallSheetSceneRow[] = scenes.map((sc) => {
    const i = locIndexFor(sc);
    const cast = sceneCast(p, sc).map((c) => {
      const m = p.cast.find((x) => x.characterName.toUpperCase() === c);
      return m ? String(m.castNumber) : c;
    });
    return {
      scene: sc, number: sc.number, intExt: sc.intExt, time: sceneTime(p, sc), set: sc.set || sc.heading,
      synopsis: (p.sceneMeta[sc.id]?.synopsis || sc.firstAction || '').replace(/\s+/g, ' '),
      cast: cast.join(', '), eighths: sceneEighths(p, sc),
      loc: i >= 0 ? String(i + 1) : locs.length ? '1' : '', address: i >= 0 ? locs[i].address : locs[0]?.address ?? '',
    };
  });
  const onSetDefault = clock.readyToShoot ?? clock.generalCall;
  const cast: ResolvedCastCall[] = sheet.cast.map((c) => {
    const upper = c.characterName.trim().toUpperCase();
    const mine = scenes.filter((sc) => sceneCast(p, sc).includes(upper));
    const m = p.cast.find((x) => x.characterName.toUpperCase() === upper);
    const firstLoc = mine.length ? locIndexFor(mine[0]) : -1;
    return {
      ...c,
      castNumber: m?.castNumber,
      inToday: mine.length > 0,
      sceneNumbers: c.sceneNumbers.trim() || mine.map((s) => s.number).join(', '),
      status: c.status.trim() || doodCodeFor(dood, upper, day.id),
      onSet: c.onSet || (onSetDefault !== null ? toClock(onSetDefault) : ''),
      loc: c.loc.trim() || (firstLoc >= 0 ? String(firstLoc + 1) : locs.length ? '1' : ''),
    };
  });
  const crew = sheet.crew.map((c) => ({ ...c, call: c.call || (clock.generalCall !== null ? toClock(clock.generalCall) : '') }));
  return {
    sheet, stored: !!stored, dayNumber: nums.get(day.id), totalDays: nums.size, clock,
    scenes: sceneRows, totalEighths: sceneRows.reduce((a, r) => a + r.eighths, 0),
    cast, crew, locations: locs,
    missingCast: [...new Set(scenes.flatMap((sc) => sceneCast(p, sc)))].filter((c) => !sheet.cast.some((x) => same(x.characterName, c))),
  };
}

// ---- Sunrise / sunset (NOAA "Almanac for Computers" algorithm, ±2 min) ----

export function parseCoords(s: string): { lat: number; lon: number } | null {
  const m = s.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

/** Local sunrise / sunset in minutes after midnight (browser time zone), or null at polar day/night. */
export function sunriseSunset(iso: string, lat: number, lon: number): { sunrise: number | null; sunset: number | null } {
  const rad = Math.PI / 180;
  const date = fromISO(iso);
  const start = new Date(date.getFullYear(), 0, 0);
  const N = Math.round((date.getTime() - start.getTime()) / 86400000);
  const lngHour = lon / 15;
  const calc = (rising: boolean): number | null => {
    const t = N + ((rising ? 6 : 18) - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    let L = M + 1.916 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 282.634;
    L = ((L % 360) + 360) % 360;
    let RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad;
    RA = ((RA % 360) + 360) % 360;
    RA += Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90;
    RA /= 15;
    const sinDec = 0.39782 * Math.sin(L * rad);
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
    if (cosH > 1 || cosH < -1) return null;
    const H = (rising ? 360 - Math.acos(cosH) / rad : Math.acos(cosH) / rad) / 15;
    const T = H + RA - 0.06571 * t - 6.622;
    const UT = (((T - lngHour) % 24) + 24) % 24;
    const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) + UT * 3600000);
    return utc.getHours() * 60 + utc.getMinutes();
  };
  return { sunrise: calc(true), sunset: calc(false) };
}
