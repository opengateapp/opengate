import type { Category, ColorSlot, Project, Schedule } from './types';
import { newId } from './ids';
import { newBudget } from '../budget/accounts';
import { addDays, dateRange, todayISO } from './dates';

export const SCHEMA_VERSION = 5;

/** Industry-standard breakdown categories and their conventional highlight colors. */
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cast', name: 'Cast', color: '#ef4444', builtIn: true },
  { id: 'extras', name: 'Background / Extras', color: '#22c55e', builtIn: true },
  { id: 'stunts', name: 'Stunts', color: '#f97316', builtIn: true },
  { id: 'vehicles', name: 'Vehicles', color: '#ec4899', builtIn: true },
  { id: 'props', name: 'Props', color: '#a855f7', builtIn: true },
  { id: 'camera', name: 'Camera', color: '#64748b', builtIn: true },
  { id: 'sfx', name: 'Special Effects', color: '#3b82f6', builtIn: true },
  { id: 'wardrobe', name: 'Wardrobe', color: '#06b6d4', builtIn: true },
  { id: 'makeup', name: 'Makeup / Hair', color: '#f472b6', builtIn: true },
  { id: 'animals', name: 'Animals', color: '#84cc16', builtIn: true },
  { id: 'music', name: 'Music', color: '#eab308', builtIn: true },
  { id: 'sound', name: 'Sound', color: '#0ea5e9', builtIn: true },
  { id: 'setDressing', name: 'Set Dressing', color: '#b45309', builtIn: true },
  { id: 'greenery', name: 'Greenery', color: '#15803d', builtIn: true },
  { id: 'equipment', name: 'Special Equipment', color: '#78716c', builtIn: true },
  { id: 'security', name: 'Security', color: '#57534e', builtIn: true },
  { id: 'labor', name: 'Additional Labor', color: '#d97706', builtIn: true },
  { id: 'vfx', name: 'Visual Effects', color: '#8b5cf6', builtIn: true },
  { id: 'mechfx', name: 'Mechanical Effects', color: '#475569', builtIn: true },
  { id: 'misc', name: 'Miscellaneous', color: '#a3a3a3', builtIn: true },
  { id: 'notes', name: 'Notes', color: '#facc15', builtIn: true },
];

/** INT/EXT × time-of-day strip palette (from CineSched's SceneColorSettings). */
export const DEFAULT_STRIP_COLORS: Record<ColorSlot, string> = {
  intDay: '#F3F4F6',
  extDay: '#FEF08A',
  intNight: '#86EFAC',
  extNight: '#93C5FD',
  intDawn: '#FDE68A',
  extDawn: '#FCD34D',
  intDusk: '#E9D5FF',
  extDusk: '#C084FC',
  intAfternoon: '#FFE4C4',
  extAfternoon: '#FDBA74',
  custom: '#D1D5DB',
};

export const COLOR_SLOT_LABELS: Record<ColorSlot, string> = {
  intDay: 'INT · Day', extDay: 'EXT · Day', intNight: 'INT · Night', extNight: 'EXT · Night',
  intDawn: 'INT · Dawn', extDawn: 'EXT · Dawn', intDusk: 'INT · Dusk', extDusk: 'EXT · Dusk',
  intAfternoon: 'INT · Afternoon', extAfternoon: 'EXT · Afternoon', custom: 'Other',
};

export const BANNER_COLORS = ['#6366F1', '#EF4444', '#14B8A6', '#D97706', '#8B5CF6', '#374151'];
export const SHOT_COLORS = ['#c84b2f', '#2f7bc8', '#2fa882', '#9b2fc8', '#c8a02f'];

export interface Option { code: string; label: string }

export const SHOT_TYPES: Option[] = [
  { code: 'EWS', label: 'Extreme Wide' }, { code: 'WS', label: 'Wide' }, { code: 'FS', label: 'Full' },
  { code: 'MWS', label: 'Medium Wide' }, { code: 'MS', label: 'Medium' }, { code: 'MCU', label: 'Medium Close-Up' },
  { code: 'CU', label: 'Close-Up' }, { code: 'ECU', label: 'Extreme Close-Up' }, { code: 'INS', label: 'Insert' },
  { code: 'OTS', label: 'Over-the-Shoulder' }, { code: 'POV', label: 'Point of View' }, { code: '2S', label: 'Two Shot' },
  { code: 'GRP', label: 'Group' }, { code: 'AER', label: 'Aerial' },
];
export const ANGLES = ['Eye Level', 'Low Angle', 'High Angle', "Bird's Eye / Overhead", 'Dutch Angle', "Worm's Eye"];
export const LENSES = ['14mm', '18mm', '24mm', '28mm', '35mm', '40mm', '50mm', '75mm', '85mm', '100mm', '135mm', '200mm', '300mm', 'Zoom', 'Anamorphic'];
export const MOVES = ['Static', 'Pan Left', 'Pan Right', 'Tilt Up', 'Tilt Down', 'Dolly In', 'Dolly Out', 'Dolly Left / Right', 'Tracking / Follow', 'Crane Up', 'Crane Down', 'Handheld', 'Steadicam', 'Drone / Aerial', 'Push In', 'Pull Back', 'Whip Pan', 'Rack Focus', 'Zoom In', 'Zoom Out'];
export const EQUIPMENT = ['Tripod', 'Dolly + Track', 'Steadicam', 'Handheld', 'Gimbal', 'Jib / Crane', 'Drone', 'Car Mount', 'Underwater Housing', 'Slider', 'Dutch Head'];
export const FOCUS = ['Deep Focus', 'Shallow Focus', 'Rack Focus', 'Split Focus', 'Soft / Diffused'];
export const LIGHTING = ['Natural Light', 'Key + Fill + Back', 'High Key', 'Low Key', 'Rembrandt', 'Butterfly / Paramount', 'Split Lighting', 'Rim / Back Lighting', 'Silhouette', 'Motivated (practical)', 'Bounce / Diffused', 'Hard / Direct', 'Available / No Lighting'];
export const SOUND = ['Sync Sound', 'MOS', 'ADR', 'Voiceover', 'Wild Track', 'Nat Sound'];
export const PRIORITIES = ['Must Have', 'Preferred', 'Coverage / Optional'];

export function emptySchedule(start = todayISO(), lengthDays = 14): Schedule {
  const endDate = addDays(start, lengthDays - 1);
  const days = dateRange(start, endDate).map((date) => ({ id: newId(), date, items: [], times: {} }));
  return { startDate: start, endDate, days, colors: {} };
}

export function newProject(title = 'Untitled Screenplay'): Project {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    title,
    createdAt: now,
    updatedAt: now,
    production: { company: '', director: '', producer: '', ad: '', contactPhone: '', defaultCall: '07:00', defaultLunch: '13:00' },
    titlePage: { title, credit: 'Written by', author: '', source: '', draftDate: '', contact: '' },
    scriptDoc: null,
    sceneNumbersLocked: false,
    sceneMeta: {},
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    elements: [],
    cast: [],
    locations: [],
    crew: [],
    shots: [],
    schedule: emptySchedule(),
    events: [],
    callSheets: {},
    storyboard: [],
    contacts: [],
    tasks: [],
    docs: [],
    avScripts: [],
    boards: [],
    festivals: [],
    socialPosts: [],
    deliverables: [],
    outlets: [],
    budget: newBudget(),
    characters: [],
    relationships: [],
    characterMap: {},
    notes: '',
  };
}
