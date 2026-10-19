// Core project model. Everything in a project references scenes, shots, elements
// and cast by stable id, so each tab stays in sync with the script.

export type Id = string;
export type ISODate = string; // YYYY-MM-DD (local calendar date, no time zone)

/** Script element types, shared by the editor, parsers, paginator and exporters. */
export type ElementType =
  | 'sceneHeading'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'
  | 'centered'
  | 'shot'
  | 'lyric'
  | 'pageBreak';

/** A flat, format-neutral script line produced by importers. */
export interface ScriptLine {
  type: ElementType;
  text: string;
  /** Character cue that is the second half of a dual-dialogue pair. */
  dual?: boolean;
  /** Scene number forced by the source file (e.g. Fountain #12A#). */
  sceneNumber?: string;
}

export interface TitlePage {
  title: string;
  credit: string;
  author: string;
  source: string;
  draftDate: string;
  contact: string;
  /** Logo image (media id), its width as % of the page, and where it sits. */
  logoId?: Id;
  logoScale?: number;
  logoPosition?: 'title' | 'top' | 'above' | 'below';
}

export type TimeOfDay = 'DAY' | 'NIGHT' | 'DAWN' | 'DUSK' | 'AFTERNOON' | 'CUSTOM';
export type IntExt = 'INT' | 'EXT' | 'INT/EXT';

/** Scene facts derived from the script document (never stored). */
export interface DerivedScene {
  id: Id;
  index: number; // 0-based script order
  number: string; // displayed scene number (locked or auto)
  heading: string;
  intExt: IntExt;
  set: string; // location / set name from the heading
  time: TimeOfDay;
  timeLabel: string; // raw time text from the heading ("CONTINUOUS", "LATER"…)
  characters: string[]; // normalized speaking characters
  taggedElementIds: Id[];
  shotIds: Id[];
  firstAction: string;
  eighths: number;
  startPage: number;
  endPage: number;
}

/** User-entered production data per scene; survives script edits. */
export interface SceneMeta {
  synopsis?: string;
  estimatedMinutes?: number; // overrides eighths × 15
  eighthsOverride?: number;
  locationId?: Id;
  /** Non-speaking cast added by hand in the breakdown. */
  extraCast?: string[];
  timeOverride?: TimeOfDay;
  notes?: string;
}

export interface Category {
  id: Id;
  name: string;
  color: string; // hex
  builtIn?: boolean;
}

/** A breakdown element (prop, wardrobe item, vehicle…). Cast lives in the roster. */
export interface BreakdownElement {
  id: Id;
  categoryId: Id;
  name: string;
  notes?: string;
  /** Scenes linked by hand (in addition to scenes where the element is tagged in the text). */
  sceneIds: Id[];
}

export interface DateRange {
  start: ISODate;
  end: ISODate;
}

export interface CastMember {
  id: Id;
  castNumber: number;
  characterName: string; // normalized, matches DerivedScene.characters
  actorName: string;
  phone?: string;
  email?: string;
  unavailable: DateRange[];
}

export interface Location {
  id: Id;
  setName: string; // matches DerivedScene.set (case-insensitive)
  realName: string;
  address: string;
  notes?: string;
  /** Location manager fields (all optional for older projects). */
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  status?: 'scouting' | 'hold' | 'confirmed' | 'passed';
  permit?: string;
  parking?: string;
  power?: string;
  restrooms?: string;
  nearestHospital?: string;
  fee?: string;
  photoIds?: Id[];
}

export interface CrewMember {
  id: Id;
  name: string;
  role: string;
  phone?: string;
  dailyDefault?: boolean;
}

export interface Shot {
  id: Id;
  sceneId: Id | null;
  order: number;
  shotNumber: string; // e.g. "1A"
  setup: string;
  name: string;
  subject: string;
  shotType: string;
  angle: string;
  lens: string;
  move: string;
  equipment: string;
  focus: string;
  lighting: string;
  sound: string;
  vfx: string;
  action: string;
  duration: string;
  priority: string;
  notes: string;
  /** Script text this shot is anchored to (kept in sync via a shot mark in the doc). */
  quote: string;
  color: string;
}

export type BannerKind = 'companyMove' | 'meal' | 'notice' | 'custom';
export type MealKind = 'lunch' | 'snack' | 'dinner' | 'second';

export interface SceneStrip {
  kind: 'scene';
  sceneId: Id;
  customStart?: string; // "HH:MM" 24h; empty → cascades
  completed?: boolean;
}

export interface BannerStrip {
  kind: 'banner';
  id: Id;
  bannerKind: BannerKind;
  meal?: MealKind;
  title: string;
  note?: string;
  color: string;
  minutes: number;
  customStart?: string;
}

export type StripItem = SceneStrip | BannerStrip;

export interface DayTimes {
  generalCall?: string; // "HH:MM"
  readyToShoot?: string;
  lunch?: string;
  wrap?: string;
}

export interface ShootDay {
  id: Id;
  date: ISODate;
  items: StripItem[];
  blackout?: boolean;
  times: DayTimes;
  notes?: string;
}

export interface ScheduleLock {
  lockedAt: string;
  workingDays: Record<string, ISODate[]>;
}

export type ColorSlot =
  | 'intDay' | 'extDay' | 'intNight' | 'extNight' | 'intDawn' | 'extDawn'
  | 'intDusk' | 'extDusk' | 'intAfternoon' | 'extAfternoon' | 'custom';

export interface Schedule {
  startDate: ISODate;
  endDate: ISODate;
  days: ShootDay[]; // one per calendar date in range, sorted
  lock?: ScheduleLock;
  colors: Partial<Record<ColorSlot, string>>;
}

export interface CalendarEvent {
  id: Id;
  date: ISODate;
  title: string;
  start?: string; // "HH:MM"
  end?: string;
  color: string;
  kind: 'prep' | 'scout' | 'rehearsal' | 'travel' | 'meeting' | 'other';
  notes?: string;
}

// ---- Call sheets (fields after CineSched's CallSheetData) ----

/** One cast row on a call sheet. Blank scene numbers / status / on-set fall back to live values. */
export interface CastCall {
  id: Id;
  characterName: string;
  actorName: string;
  sceneNumbers: string; // "" → today's scenes for this character
  status: string; // "" → DOOD code (SW / W / WF / SWF)
  pickup: string; // "HH:MM"
  hmu: string;
  onSet: string; // "" → ready to shoot / general call
  wrap: string;
  loc: string; // location number on this sheet; "" → auto
  /** Special instructions for this actor. */
  notes?: string;
}

export interface CrewCall {
  id: Id;
  crewId?: Id;
  role: string;
  name: string;
  call: string; // "" → general call
  phone: string;
  email?: string;
}

export interface CallSheetLocation {
  id: Id;
  name: string;
  address: string;
}

// ---- Call sheet page layout (all optional so older sheets keep working) ----

export type CallSheetSectionKind = 'scenes' | 'cast' | 'crew' | 'notes' | 'locations' | 'advance' | 'table';

export interface CallSheetSection {
  id: Id;
  kind: CallSheetSectionKind;
  title: string;
  hidden?: boolean;
  /** Custom tables. */
  columns?: string[];
  rows?: { id: Id; cells: string[] }[];
  /** Notes boxes: left and right columns. */
  text?: string;
  text2?: string;
}

export interface CallSheetInfoRow {
  id: Id;
  label: string;
  value: string;
  /** Blank values show this live value (lunch from the schedule, sun times, weather). */
  bind?: 'lunch' | 'sunrise' | 'sunset' | 'weather' | 'wrap' | 'readyToShoot';
}

export interface CallSheetContact {
  id: Id;
  role: string;
  name: string;
  phone: string;
}

/** Scene rows added by hand (beyond the day's strips). */
export interface CallSheetExtraScene {
  id: Id;
  scene: string;
  set: string;
  description: string;
  cast: string;
  dn: string;
  pages: string;
  notes: string;
}

/** Per-day call sheet. General call, ready-to-shoot, lunch and wrap live on the ShootDay
 *  (day.times) so the stripboard and the call sheet never disagree. Scenes always come from the day's strips. */
export interface CallSheet {
  workDaySchedule: string;
  quote: string;
  snack: string;
  dinner: string;
  weatherTemp: string;
  weatherCondition: string;
  weatherPrecipWind: string;
  sunTimes: string;
  /** "lat, lon" used to compute sunrise / sunset. */
  coords: string;
  basecamp: string;
  nearestHospital: string;
  locations: CallSheetLocation[];
  cast: CastCall[];
  crew: CrewCall[];
  notes: string;
  // Page layout
  fileName?: string;
  productionTitle?: string;
  logoId?: Id;
  companyInfo?: string;
  keyContacts?: CallSheetContact[];
  infoRows?: CallSheetInfoRow[];
  topNotes?: string;
  showMap?: boolean;
  sections?: CallSheetSection[];
  /** Location / notes column of the scenes table, by scene id. */
  sceneNotes?: Record<Id, string>;
  extraScenes?: CallSheetExtraScene[];
}

// ---- Storyboard ----

/** A storyboard frame hanging on a shot. Images live as Blobs in IndexedDB (store/media.ts)
 *  and in the project file's media/ folder; the project only holds their ids. */
export interface StoryboardFrame {
  id: Id;
  shotId: Id;
  order: number;
  /** Uploaded background image. */
  imageId?: Id;
  /** Transparent PNG drawing layer drawn over the image. */
  drawingId?: Id;
  /** Bumped whenever a media blob is rewritten, so thumbnails refresh. */
  rev: number;
  caption: string;
  /** Set plan / reference box: an uploaded photo and a drawing layer over it. */
  refImageId?: Id;
  refDrawingId?: Id;
  /** Formatted description (docs schema JSON). Its plain text is kept in the shot's Action field. */
  descDoc?: unknown;
}

export interface StoryboardSettings {
  /** Panels per page: 1, 2 or 3 stack full-width panels with a set-plan box; 4 and 6 are grids. */
  perPage: 1 | 2 | 3 | 4 | 6;
  showReference: boolean;
}

// ---- Plan: contacts and tasks ----

export type ContactKind = 'crew' | 'cast' | 'vendor' | 'location' | 'agent' | 'other';

/** People and companies other than the cast / crew rosters (which stay in cast[] / crew[]). */
export interface Contact {
  id: Id;
  name: string;
  kind: ContactKind;
  role: string;
  company: string;
  phone: string;
  email: string;
  notes: string;
}

export interface Task {
  id: Id;
  title: string;
  done: boolean;
  due?: ISODate;
  /** Contact, cast or crew id (free text allowed). */
  assignee?: string;
  department?: string;
  priority?: 'high' | 'normal' | 'low';
  notes?: string;
  order: number;
}

// ---- Write: documents and A/V scripts ----

export interface DocFile {
  id: Id;
  title: string;
  /** ProseMirror JSON of the docs schema (script/docSchema.ts). */
  doc: unknown;
  updatedAt: string;
}

export interface AVRow {
  id: Id;
  /** Optional segment heading shown above the row (acts like a scene for A/V scripts). */
  segment?: string;
  video: string;
  audio: string;
  duration: string; // "0:15"
  shotType?: string;
  /** Screenplay scene this row was imported from (so re-importing only adds new scenes). */
  sceneId?: Id;
}

export interface AVScript {
  id: Id;
  title: string;
  rows: AVRow[];
  updatedAt: string;
}

// ---- Visualize: mood boards and whiteboards ----

export type BoardItemType = 'image' | 'note' | 'text' | 'link' | 'swatch' | 'shape' | 'frame' | 'stroke';

export interface BoardItem {
  id: Id;
  type: BoardItemType;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  /** Image stored in IndexedDB (media). */
  imageId?: Id;
  /** Remote image URL when the image could not be copied (e.g. blocked by the host). */
  imageUrl?: string;
  /** Where the image/link came from (original website). */
  sourceUrl?: string;
  /** Pinterest pin page, for pins imported from Pinterest. */
  pinUrl?: string;
  caption?: string;
  text?: string;
  color?: string;
  shape?: 'rect' | 'ellipse' | 'arrow' | 'line';
  /** Stroke points relative to x/y. */
  points?: number[];
  strokeWidth?: number;
  /** Pen pressure per point of a drawn stroke (0–1); varies the line width. */
  pressures?: number[];
  /** Links into the production: these make the image show up in breakdown, shots and locations. */
  sceneIds?: Id[];
  locationIds?: Id[];
  characters?: string[];
  shotIds?: Id[];
}

export interface Board {
  id: Id;
  title: string;
  kind: 'mood' | 'whiteboard';
  items: BoardItem[];
  /** Live collaboration room id when shared. */
  roomId?: string;
  updatedAt: string;
}

export interface ProductionInfo {
  company: string;
  director: string;
  producer: string;
  ad: string;
  contactPhone: string;
  defaultCall: string;
  defaultLunch: string;
}

/** An invite link the owner created (kept locally so it can be copied again; the relay only stores its hash). */
export interface ShareLink {
  token: string;
  label: string;
  /** Channels this link may change: ['*'] = everything, [] = view only. */
  write: string[];
  /** Restricted channels this link may see (the budget). */
  read?: string[];
  created: string;
}

/** This person's access to a shared project. Never synced; travels in linked .opengate files. */
export interface ShareInfo {
  relay: string;
  room: string;
  /** End-to-end encryption key (base64url). Only ever in links and on this device. */
  key: string;
  /** Separate key for the budget; only people the owner shared the budget with have it. */
  budgetKey?: string;
  /** Link token, or the owner's admin secret. */
  token: string;
  admin: boolean;
  /** Channels this person may change, as the relay reported it. */
  write: string[];
  links?: ShareLink[];
  /** Set by the owner when sharing starts, until the first upload is done. */
  fresh?: boolean;
  joinedAt: string;
}

// ---------- Budget ----------

/** Top-sheet groups: above the line, below the line (production), post, other. */
export type BudgetGroup = 'atl' | 'btl' | 'post' | 'other';
export type BudgetUnits = 'flat' | 'allow' | 'days' | 'weeks' | 'hours' | 'each' | 'rentdays';
/** Where a linked line's quantity comes from. */
export type BudgetLinkKind = 'cast' | 'castHold' | 'crew' | 'location' | 'element' | 'shootDays' | 'headcount' | 'gear';

export interface BudgetAccount {
  id: Id;
  code: string;
  name: string;
  group: BudgetGroup;
  /** Top-down allocation for this account (amount). */
  target?: number;
}

export interface BudgetLine {
  id: Id;
  accountId: Id;
  description: string;
  /** Amount of units (days, weeks…); for linked lines this follows the breakdown and schedule. */
  qty: number;
  units: BudgetUnits;
  /** Multiplier (people, items, episodes). */
  x: number;
  rate: number;
  fringeIds: Id[];
  notes?: string;
  /** Extra paid days before / after the shoot, added to a linked quantity (crew prep, location set-up and strike). */
  prepDays?: number;
  wrapDays?: number;
  /** Overtime hours in total, and days paid at the 6th / 7th-day rate (day-rate lines). */
  otHours?: number;
  sixthDays?: number;
  seventhDays?: number;
  /** Formulas with named numbers (e.g. "SHOOT_WEEKS * 5"), used instead of the typed qty / x. */
  qtyExpr?: string;
  xExpr?: string;
  /** Sub-items that add up to the rate (a camera package: body, lenses, support…). */
  items?: { id: Id; description: string; qty: number; rate: number }[];
  /** Imported from the breakdown; `auto` keeps the quantity in step with the script and schedule. */
  link?: { kind: BudgetLinkKind; id?: Id; auto: boolean };
}

/** Payroll taxes, union pension & health…: a percentage of the lines it's applied to. */
export interface BudgetFringe {
  id: Id;
  name: string;
  pct: number;
  /** Most of each line's amount the fringe applies to (wage caps). */
  cap?: number;
  /** The cap is per person across the whole show (lines linked to the same person share it). */
  capPerPerson?: boolean;
  /** A flat amount on top of the percentage (union contributions per day or week). */
  flat?: number;
  flatPer?: 'day' | 'week' | 'line';
}

/** A named number lines can use in formulas (SHOOT_WEEKS * 5). */
export interface BudgetGlobal { id: Id; name: string; value: number; note?: string }

/** The approved budget, frozen for the cost report. */
export interface BudgetLock {
  at: string;
  label?: string;
  /** Account totals when locked (including fringes). */
  accounts: Record<Id, number>;
  subtotal: number;
  total: number;
}

/** A what-if version of the budget: changes on top of the base lines. */
export interface BudgetScenario {
  id: Id;
  name: string;
  /** Overrides the shoot length for lines that are per shoot day. */
  shootDays?: number;
  overrides: Record<Id, { qty?: number; x?: number; rate?: number; removed?: boolean }>;
  added: BudgetLine[];
}

export interface BudgetExpense {
  id: Id;
  date: ISODate;
  vendor: string;
  description: string;
  amount: number;
  accountId: Id;
  lineId?: Id;
  /** Receipt photo or PDF (media id). */
  receiptId?: Id;
  paid: boolean;
  method?: string;
}

export interface BudgetApplied {
  id: Id;
  name: string;
  pct: number;
  appliesTo: BudgetGroup[];
  /** A credit or rebate (comes off the total), e.g. a film tax incentive. */
  credit?: boolean;
}

export interface Budget {
  currency: string;
  accounts: BudgetAccount[];
  lines: BudgetLine[];
  fringes: BudgetFringe[];
  contingencyPct: number;
  /** Groups contingency is charged on (default: all). */
  contingencyAppliesTo?: BudgetGroup[];
  /** Insurance, completion bond, production fee, tax credit…: percentages of chosen groups. */
  applied?: BudgetApplied[];
  /** Rental week: a 7-day rental billed as this many days (default 3). */
  rentalWeekDays?: number;
  /** Insurance & upkeep on gear you own, as a % of what renting it would cost (0 = none). */
  ownedGearPct?: number;
  /** Overtime basis for day-rate lines: hours in a day, and the multipliers. */
  dayHours?: number;
  otMult?: number;
  sixthMult?: number;
  seventhMult?: number;
  /** Top-down total to plan against. */
  targetTotal?: number;
  globals?: BudgetGlobal[];
  /** Notes & assumptions (printed after the top sheet). */
  notes?: string;
  locked?: BudgetLock;
  /** Cost report: estimate to complete per account, where you've typed one. */
  etc?: Record<Id, number>;
  scenarios: BudgetScenario[];
  expenses: BudgetExpense[];
}

// ---------- Characters ----------

/** Lawful/Neutral/Chaotic × Good/Neutral/Evil, e.g. 'LG', 'NN' (true neutral), 'CE'. */
export type Alignment = 'LG' | 'NG' | 'CG' | 'LN' | 'NN' | 'CN' | 'LE' | 'NE' | 'CE';

export interface ContinuityPhoto {
  id: Id;
  kind: 'wardrobe' | 'hair';
  imageId: string;
  caption: string;
  /** Which look this belongs to, e.g. "Look 2 — torn jacket". */
  look?: string;
  /** Scenes this look is worn in. */
  sceneIds: Id[];
}

/** A character sheet: a stripped-down D&D-style builder plus a script character profile. */
export interface CharacterProfile {
  id: Id;
  /** Normalized like script characters (uppercase), so it matches the script and cast. */
  name: string;
  portraitId?: string;
  // Core
  race: string;
  gender: string;
  alignment?: Alignment;
  role: string;
  strengths: string[];
  weaknesses: string[];
  faults: string[];
  actions: string[];
  /** Free-form fields from the profile template (Basic info, Physical, Personality, Inner psyche, Additional). */
  info: Record<string, string>;
  /** 0 = introvert, 100 = extrovert. */
  introExtro?: number;
  /** Character archetype (when the project uses archetypes instead of the alignment grid). */
  archetype?: string;
  /** Character arc (reference: flat, positive change, fall…). */
  arc?: string;
  continuity: ContinuityPhoto[];
}

/** Per-project choices for the Character Builder's lists and fields (Settings → Character builder). */
export interface CharacterOptions {
  roles: string[];
  genders: string[];
  /** Species packs switched on (SPECIES_PACKS ids). */
  speciesPacks: string[];
  /** The project's own species / kinds. */
  customSpecies: string[];
  /** Name of the species field ("Species", "Race", "Kind"…). */
  speciesLabel: string;
  /** What the 3×3 panel shows. */
  compass: 'alignment' | 'archetype' | 'none';
  archetypes: string[];
  /** Built-in profile fields to hide (by field key). */
  hiddenFields: string[];
  /** Extra fields, per profile section. */
  customFields: { id: string; section: string; label: string; long?: boolean }[];
  /** Species packs made by users (switched on like built-in packs, by id in speciesPacks). */
  customPacks?: SpeciesPack[];
}

/** A user-made species pack: picked from other packs or typed, shareable as an .ogspecies file. */
export interface SpeciesPack {
  id: Id;
  name: string;
  author?: string;
  entries: { name: string; note?: string }[];
}

/** How two characters are connected (by name, so script characters without a profile count too). */
export interface CharacterRelationship {
  id: Id;
  a: string;
  b: string;
  /** RELATIONSHIP_KINDS id. */
  kind: string;
  /** In words, from A's side: "older sister", "owes money to". */
  label?: string;
  /** Only A → B (a secret crush, a debt); otherwise both ways. */
  oneWay?: boolean;
  /** −2 hostile … 0 neutral … +2 close. */
  tone?: number;
  notes?: string;
}

// ---------- Shot designer ----------

export type PlanElementKind = 'actor' | 'camera' | 'light' | 'prop' | 'wall' | 'door' | 'window' | 'text';
/** A point on a movement path (feet; rotation in degrees). */
export interface PlanKey { x: number; y: number; rot?: number }

/** Something on a scene's floor plan. Positions are in feet, 0° = facing right, clockwise. */
export interface PlanElement {
  id: Id;
  kind: PlanElementKind;
  x: number;
  y: number;
  rot: number;
  label: string;
  color?: string;
  /** Size in feet (walls: length × thickness; props: footprint). */
  w?: number;
  h?: number;
  /** Cameras: lens and sensor, and the shot this camera is. */
  focal?: number;
  sensor?: string;
  shotId?: Id;
  /** Cameras and actors: where they move during the shot. */
  path?: PlanKey[];
  /** Actors: the character they are. */
  character?: string;
  /** Lights: fixture type and colour temperature. */
  lightType?: string;
  kelvin?: number;
}

/** A scene's top-down plan. */
export interface ScenePlan {
  id: Id;
  sceneId: Id;
  elements: PlanElement[];
  /** Set drawing or location photo underneath, `bgWidth` feet wide. */
  backgroundId?: Id;
  bgWidth?: number;
  bgOpacity?: number;
}

// ---------- Gear ----------

export type GearCategory = 'camera' | 'lens' | 'support' | 'grip' | 'lighting' | 'sound' | 'power' | 'other';
/** Own it (no rental), rent it (per day / week), borrow it (free), or buy it (one-off). */
export type GearSource = 'own' | 'rent' | 'borrow' | 'buy';

export interface GearItem {
  id: Id;
  name: string;
  category: GearCategory;
  qty: number;
  source: GearSource;
  /** Rent: per day or per week; buy: the price. */
  rate: number;
  rateUnit: 'day' | 'week';
  /** Scenes it's needed in (empty = the whole shoot). */
  sceneIds: Id[];
  /** Typed number of days, instead of counting shoot days with those scenes. */
  days?: number;
  notes?: string;
  /** Put on the manifest by the shot designer ("cam:A", "light:LED panel"); manual items have none. */
  fromPlan?: { key: string };
}

export interface Project {
  schemaVersion: number;
  id: Id;
  title: string;
  createdAt: string;
  updatedAt: string;
  production: ProductionInfo;
  titlePage: TitlePage;
  /** ProseMirror document JSON (see script/schema.ts). */
  scriptDoc: unknown;
  sceneNumbersLocked: boolean;
  sceneMeta: Record<Id, SceneMeta>;
  categories: Category[];
  elements: BreakdownElement[];
  cast: CastMember[];
  locations: Location[];
  crew: CrewMember[];
  shots: Shot[];
  schedule: Schedule;
  events: CalendarEvent[];
  /** Call sheet per shoot day, keyed by ShootDay.id. */
  callSheets: Record<Id, CallSheet>;
  storyboard: StoryboardFrame[];
  storyboardSettings?: StoryboardSettings;
  contacts: Contact[];
  tasks: Task[];
  docs: DocFile[];
  avScripts: AVScript[];
  boards: Board[];
  budget: Budget;
  /** Character profiles (Write → Characters), matched to the script by name. */
  characters: CharacterProfile[];
  relationships: CharacterRelationship[];
  gear?: GearItem[];
  plans?: ScenePlan[];
  characterOptions?: CharacterOptions;
  /** Where each character sits on the relationship map (by name). */
  characterMap: Record<string, { x: number; y: number }>;
  notes: string;
  /** Present when this project is shared through a relay. */
  share?: ShareInfo;
}
