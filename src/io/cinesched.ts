import type { BannerKind, BannerStrip, CalendarEvent, CallSheet, Project, ScriptLine, ShootDay, StripItem, TimeOfDay } from '../model/types';
import { newProject } from '../model/defaults';
import { newId } from '../model/ids';
import { toISO, parseClock, toClock } from '../model/dates';
import { linesToDoc, docToBlocks } from '../script/schema';
import { emptyCallSheet } from '../schedule/callsheet';
import { parseHeading } from '../script/heading';

// Opens a CineSched (macOS) project JSON so existing schedules carry over.
// CineSched has no script text, so each scene becomes a heading + its summary,
// with page length, time and cast kept as per-scene overrides.

interface CSScene {
  id: string; title: string; sceneNumber?: string; duration?: number; estimatedTime?: number;
  dayNightType?: string; cast?: string[] | string; summary?: string;
  realLocation?: string; locationAddress?: string;
  extras?: string[]; props?: string[]; setDressing?: string[]; wardrobe?: string[]; makeupHair?: string[];
  vehicles?: string[]; specialEquipment?: string[]; stunts?: string[]; sfx?: string[]; vfx?: string[];
  breakdownNotes?: string;
  isBanner?: boolean; bannerType?: string; bannerTitle?: string; bannerNote?: string; bannerColorHex?: string;
  isAutoMeal?: boolean; mealKind?: string; isCalendarEvent?: boolean; customStartTime?: string; isCompleted?: boolean;
}
interface CSDay { id: string; date: string | number; scenes: CSScene[]; isBlackout?: boolean; callSheet?: Record<string, unknown> }
interface CSProject {
  allScenes: CSScene[]; shootDays: CSDay[]; projectTitle?: string;
  productionInfo?: {
    companyName?: string; directorName?: string; producerName?: string; adName?: string; contactNumber?: string; defaultLunchTime?: string;
    crew?: { id: string; name: string; role: string; phone?: string; isDailyDefault?: boolean }[];
    castList?: { id: string; actorName: string; characterName: string; unavailableRanges?: { start: string | number; end: string | number }[] }[];
    locationRoster?: { id: string; name: string; address: string }[];
  };
}

export function isCineSchedProject(json: unknown): json is CSProject {
  return !!json && typeof json === 'object' && Array.isArray((json as CSProject).allScenes) && Array.isArray((json as CSProject).shootDays);
}

function csDate(v: string | number): string {
  if (typeof v === 'number') return toISO(new Date((v + 978307200) * 1000)); // seconds since 2001-01-01
  const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? toISO(new Date(v)) : toISO(new Date(v));
}

const TIME: Record<string, TimeOfDay> = { DAY: 'DAY', NIGHT: 'NIGHT', DAWN: 'DAWN', DUSK: 'DUSK', AFTERNOON: 'AFTERNOON', CUSTOM: 'CUSTOM' };

const BREAKDOWN_FIELDS: [keyof CSScene, string][] = [
  ['extras', 'extras'], ['props', 'props'], ['setDressing', 'setDressing'], ['wardrobe', 'wardrobe'],
  ['makeupHair', 'makeup'], ['vehicles', 'vehicles'], ['specialEquipment', 'equipment'], ['stunts', 'stunts'],
  ['sfx', 'sfx'], ['vfx', 'vfx'],
];

function bannerKind(t?: string): BannerKind {
  if (!t) return 'notice';
  if (/move|traslado/i.test(t)) return 'companyMove';
  if (/meal|comida/i.test(t)) return 'meal';
  if (/custom|personal/i.test(t)) return 'custom';
  return 'notice';
}

export function importCineSched(cs: CSProject): Project {
  const p = newProject(cs.projectTitle || 'Imported Schedule');
  const isScene = (s: CSScene) => !s.isBanner && !s.isAutoMeal && !s.isCalendarEvent;
  const all = [...cs.allScenes.filter(isScene), ...cs.shootDays.flatMap((d) => d.scenes.filter(isScene))];
  const sortKey = (s: CSScene) => {
    const m = (s.sceneNumber || '').match(/^(\d+)([A-Z]*)/i);
    return m ? Number(m[1]) * 100 + (m[2] ? m[2].toUpperCase().charCodeAt(0) - 64 : 0) : 1e9;
  };
  all.sort((a, b) => sortKey(a) - sortKey(b));

  const lines: ScriptLine[] = [];
  const idMap = new Map<string, number>();
  for (const s of all) {
    idMap.set(s.id, lines.length);
    lines.push({ type: 'sceneHeading', text: s.title.toUpperCase(), sceneNumber: s.sceneNumber || undefined });
    if (s.summary) lines.push({ type: 'action', text: s.summary });
  }
  const doc = linesToDoc(lines);
  p.scriptDoc = doc.toJSON();
  p.sceneNumbersLocked = true;
  const blocks = docToBlocks(p.scriptDoc);
  const sceneIdFor = new Map<string, string>();
  for (const [csId, blockIdx] of idMap) sceneIdFor.set(csId, blocks[blockIdx].attrs.sceneId as string);

  const elementKey = new Map<string, string>();
  for (const s of all) {
    const sid = sceneIdFor.get(s.id)!;
    const cast = Array.isArray(s.cast) ? s.cast : (s.cast ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    p.sceneMeta[sid] = {
      eighthsOverride: s.duration || undefined,
      estimatedMinutes: s.estimatedTime || undefined,
      timeOverride: TIME[(s.dayNightType || '').toUpperCase()],
      extraCast: cast.map((c) => c.toUpperCase()),
      synopsis: s.summary,
      notes: s.breakdownNotes,
    };
    for (const [field, cat] of BREAKDOWN_FIELDS) {
      for (const name of (s[field] as string[] | undefined) ?? []) {
        if (!name.trim()) continue;
        const key = cat + '|' + name.trim().toLowerCase();
        let id = elementKey.get(key);
        if (!id) {
          id = newId();
          elementKey.set(key, id);
          p.elements.push({ id, categoryId: cat, name: name.trim(), sceneIds: [] });
        }
        p.elements.find((e) => e.id === id)!.sceneIds.push(sid);
      }
    }
    if (s.realLocation) {
      const set = parseHeading(s.title).set;
      if (!p.locations.some((l) => l.setName === set)) {
        p.locations.push({ id: newId(), setName: set, realName: s.realLocation, address: s.locationAddress ?? '' });
      }
    }
  }

  const info = cs.productionInfo;
  if (info) {
    p.production.company = info.companyName ?? '';
    p.production.director = info.directorName ?? '';
    p.production.producer = info.producerName ?? '';
    p.production.ad = info.adName ?? '';
    p.production.contactPhone = info.contactNumber ?? '';
    const lunch = parseClock(info.defaultLunchTime);
    if (lunch !== null) p.production.defaultLunch = toClock(lunch);
    p.cast = (info.castList ?? []).map((c, i) => ({
      id: newId(), castNumber: i + 1, characterName: c.characterName.toUpperCase(), actorName: c.actorName,
      unavailable: (c.unavailableRanges ?? []).map((r) => ({ start: csDate(r.start), end: csDate(r.end) })),
    }));
    p.crew = (info.crew ?? []).map((c) => ({ id: newId(), name: c.name, role: c.role, phone: c.phone, dailyDefault: c.isDailyDefault }));
    for (const l of info.locationRoster ?? []) {
      if (!p.locations.some((x) => x.realName === l.name)) p.locations.push({ id: newId(), setName: '', realName: l.name, address: l.address });
    }
  }

  const days: ShootDay[] = [];
  const events: CalendarEvent[] = [];
  for (const d of cs.shootDays) {
    const date = csDate(d.date);
    const items: StripItem[] = [];
    const cs0 = d.callSheet ?? {};
    const t = (k: string) => { const v = parseClock(cs0[k] as string); return v === null ? undefined : toClock(v); };
    for (const s of d.scenes) {
      if (s.isCalendarEvent) {
        events.push({ id: newId(), date, title: s.title, color: '#6366F1', kind: 'other', notes: s.summary, start: t('') });
      } else if (s.isAutoMeal) {
        if (/lunch|snack|dinner|almuerzo|cena/i.test(s.mealKind ?? '')) {
          const b: BannerStrip = { kind: 'banner', id: newId(), bannerKind: 'meal', meal: /snack/i.test(s.mealKind!) ? 'snack' : /dinner|cena/i.test(s.mealKind!) ? 'dinner' : 'lunch', title: s.mealKind ?? 'Lunch', color: '#18181B', minutes: s.estimatedTime ?? 60 };
          items.push(b);
        }
      } else if (s.isBanner) {
        items.push({ kind: 'banner', id: newId(), bannerKind: bannerKind(s.bannerType), title: s.bannerTitle || s.title, note: s.bannerNote, color: '#' + (s.bannerColorHex || '8B5CF6').replace('#', ''), minutes: s.estimatedTime ?? 30, customStart: s.customStartTime ? toClock(parseClock(s.customStartTime) ?? 0) : undefined });
      } else {
        const sid = sceneIdFor.get(s.id);
        if (sid) items.push({ kind: 'scene', sceneId: sid, completed: s.isCompleted, customStart: s.customStartTime ? toClock(parseClock(s.customStartTime) ?? 0) : undefined });
      }
    }
    const dayId = newId();
    days.push({ id: dayId, date, items, blackout: d.isBlackout, times: { generalCall: t('generalCallTime'), readyToShoot: t('readyToShootTime'), lunch: t('lunchTime'), wrap: t('wrapTime') } });
    const sheet = csCallSheet(cs0);
    if (sheet) p.callSheets[dayId] = sheet;
  }
  days.sort((a, b) => a.date.localeCompare(b.date));
  if (days.length) {
    p.schedule.startDate = days[0].date;
    p.schedule.endDate = days[days.length - 1].date;
  }
  p.schedule.days = days;
  p.events = events;
  return p;
}

/** CineSched's per-day CallSheetData → a Open Gate call sheet (only when it holds anything beyond times). */
function csCallSheet(c: Record<string, unknown>): CallSheet | null {
  const str = (k: string) => (typeof c[k] === 'string' ? (c[k] as string) : '');
  const clock = (v: unknown) => { const m = parseClock(typeof v === 'string' ? v : ''); return m === null ? '' : toClock(m); };
  type Row = Record<string, string>;
  const cast = (Array.isArray(c.castCallEntries) ? c.castCallEntries as Row[] : []).map((e) => ({
    id: newId(), characterName: (e.characterName ?? '').toUpperCase(), actorName: e.actorName ?? '', sceneNumbers: e.sceneNumbers ?? '', status: e.ecdt ?? '',
    pickup: clock(e.pickupTime), hmu: clock(e.hmuWardrobeTime), onSet: clock(e.onSetTime), wrap: clock(e.wrapTime), loc: e.locationIndex ?? '',
  }));
  const crew = (Array.isArray(c.crewCallEntries) ? c.crewCallEntries as Row[] : []).map((e) => ({ id: newId(), role: e.role ?? '', name: e.name ?? '', call: clock(e.callTime), phone: e.phone ?? '' }));
  const locations = (Array.isArray(c.locations) ? c.locations as Row[] : []).map((l) => ({ id: newId(), name: l.name ?? '', address: l.address ?? '' }));
  const sheet: CallSheet = {
    ...emptyCallSheet(),
    workDaySchedule: str('workDaySchedule'), quote: str('quoteOfTheDay'), snack: clock(c.snackTime), dinner: clock(c.dinnerTime),
    weatherTemp: str('weatherTemp'), weatherCondition: str('weatherCondition'), weatherPrecipWind: str('weatherPrecipWind'), sunTimes: str('sunTimes'),
    basecamp: str('basecampLocation'), nearestHospital: str('nearestHospital'),
    locations, cast, crew,
    notes: str('notes') || (Array.isArray(c.productionNotes) ? (c.productionNotes as string[]).join('\n') : ''),
  };
  const hasContent = cast.length || crew.length || locations.length || [sheet.workDaySchedule, sheet.quote, sheet.snack, sheet.dinner, sheet.weatherTemp, sheet.weatherCondition, sheet.weatherPrecipWind, sheet.sunTimes, sheet.basecamp, sheet.nearestHospital, sheet.notes].some(Boolean);
  return hasContent ? sheet : null;
}
