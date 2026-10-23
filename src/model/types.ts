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
  /** Story day this scene happens on (Story Bible), for continuity. */
  storyDay?: number;
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
  /** Union membership (no member ID numbers — see Paperwork). */
  union?: string;
  unionStatus?: UnionStatus;
  /** e.g. "600" for IATSE Local 600. */
  unionLocal?: string;
  /** Honorary societies (ids from the Societies list): letters after the name in credits. */
  societies?: string[];
  /** The PGA certified this person's producing credit on this production (the p.g.a. mark). */
  pgaCertified?: boolean;
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
  /** Union membership (no member ID numbers — see Paperwork). */
  union?: string;
  unionStatus?: UnionStatus;
  /** e.g. "600" for IATSE Local 600. */
  unionLocal?: string;
  /** Honorary societies (ids from the Societies list): letters after the name in credits. */
  societies?: string[];
  /** The PGA certified this person's producing credit on this production (the p.g.a. mark). */
  pgaCertified?: boolean;
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
  /** Framing the panels are drawn in: '16:9' (default), '9:16', '2.39', '1.43'… (tabs/storyboard/formats.ts). */
  format?: string;
  /** Extra frame guides drawn inside each panel, e.g. protect for '16:9' and '9:16'. */
  guides?: string[];
  /** Show the frame guides on the panels and in the PDF too (not only while drawing). Default on. */
  guidesInPrint?: boolean;
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
  /** Union membership (no member ID numbers — see Paperwork). */
  union?: string;
  unionStatus?: UnionStatus;
  /** e.g. "600" for IATSE Local 600. */
  unionLocal?: string;
  /** Honorary societies (ids from the Societies list): letters after the name in credits. */
  societies?: string[];
  /** The PGA certified this person's producing credit on this production (the p.g.a. mark). */
  pgaCertified?: boolean;
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

export type BoardItemType = 'image' | 'note' | 'text' | 'link' | 'swatch' | 'shape' | 'frame' | 'stroke' | 'connector' | 'card';

/** A live card on a board: shows a project thing's current info and opens it. */
export type BoardRefKind = 'character' | 'place' | 'scene' | 'location' | 'shot';

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
  /** Connectors: the items they join (they follow them when moved). */
  from?: Id;
  to?: Id;
  dashed?: boolean;
  /** Arrowheads on a connector (default: at the end). */
  arrow?: 'none' | 'end' | 'both';
  /** Cards: the project thing shown. */
  ref?: { kind: BoardRefKind; id: string };
}

export interface Board {
  id: Id;
  title: string;
  /** story: a story map (connected cards, beats, timelines) — same canvas as mood boards. */
  kind: 'mood' | 'whiteboard' | 'story';
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
  /** Shooting time per eighth of a page, for scene estimates (default 15 min = 2 h per page). */
  minutesPerEighth?: number;
  /** The production's union agreement (sets defaults for new cast). */
  agreement?: { union?: string; tier?: string };
}

/** An invite link the owner created (kept locally so it can be copied again; the relay only stores its hash). */
export interface ShareLink {
  token: string;
  label: string;
  /** Channels this link may change: ['*'] = everything, [] = view only. */
  write: string[];
  /** Restricted channels this link may see (the budget). */
  read?: string[];
  /** Channels never sent to this link (tabs hidden from it; format-2 rooms). */
  hide?: string[];
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
  /** Room format: 1 = one channel per section (older rooms), 2 = one per tab (per-tab access). */
  format?: 1 | 2;
  /** Owner: moving the room to format 2 — tell the relay once the new channels are uploaded. */
  migrating?: boolean;
  /** Channels the relay doesn't send to this person (tabs hidden by their link). */
  hide?: string[];
  joinedAt: string;
}

// ---------- Budget ----------

/** Top-sheet groups: above the line, below the line (production), post, other. */
export type BudgetGroup = 'atl' | 'btl' | 'post' | 'other';
export type BudgetUnits = 'flat' | 'allow' | 'days' | 'weeks' | 'hours' | 'each' | 'rentdays';
/** Where a linked line's quantity comes from. */
export type BudgetLinkKind = 'cast' | 'castHold' | 'crew' | 'location' | 'element' | 'shootDays' | 'headcount' | 'gear' | 'license' | 'kit' | 'festival' | 'festivalTravel';

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

// ---------- Licenses & clearances ----------

export type LicenseKind = 'music' | 'stock' | 'archival' | 'photo' | 'font' | 'software' | 'other';
export type LicenseStatus = 'needed' | 'requested' | 'quoted' | 'licensed' | 'declined';

/** A music, footage or other license: what it is, the terms, the cost and the credit it needs. */
export interface License {
  id: Id;
  kind: LicenseKind;
  title: string;
  /** Artist / performer. */
  performer?: string;
  /** Writers / composers. */
  writers?: string;
  publisher?: string;
  /** Label / master owner. */
  label?: string;
  /** Where it's licensed from: Artlist, Pond5, a label, the artist… */
  source?: string;
  licenseType?: string;
  licenseNumber?: string;
  media?: string;
  territory?: string;
  term?: string;
  start?: ISODate;
  expires?: ISODate;
  fee: number;
  status: LicenseStatus;
  sceneIds: Id[];
  tcIn?: string;
  tcOut?: string;
  /** Music: background, visual vocal, theme… */
  useType?: string;
  /** Typed credit line; empty = the suggested one. */
  credit?: string;
  inCredits: boolean;
  /** The license document (media id). */
  fileId?: Id;
  notes?: string;
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
  /** Music, stock footage and other licenses (clearances). */
  licenses: License[];
  /** Deal memos, releases and start paperwork (private like the rest of the budget). */
  paperwork?: PaperDoc[];
  /** Clearances log: locations, artwork, brands, names… */
  clearances?: Clearance[];
  /** Hours actually worked, per person per shoot day. */
  timecards?: TimeCard[];
  /** Overtime and meal rules for time cards. */
  payrollRules?: PayrollRules;
  /** This project's own wording for release and deal memo templates. */
  templates?: Partial<Record<PaperKind, string>>;
  /** Union agreements you signed, attached from Reference → Guilds & Unions. */
  agreements?: SignedAgreement[];
  /** Where the money comes from (Budget → Funding). Private like the rest of the budget. */
  fundingSources?: FundingSource[];
  /** Funding settings: estimate pace, starter-rate level, crowdfunding plan. */
  funding?: FundingPlan;
  /** Festivals you're aiming at: deadlines, fees and status (Budget → Festivals). */
  festivals?: Festival[];
}

export type FestivalStatus = 'considering' | 'planned' | 'submitted' | 'accepted' | 'declined' | 'withdrawn';
export type FestivalTier = 'top' | 'target' | 'local' | 'long-shot';
export type PremiereRule = 'world' | 'international' | 'north-american' | 'national' | 'regional' | 'none';

export interface FestivalDeadline { id: Id; label: string; date: ISODate; fee: number }

/** A festival on your list. Typed or pasted in by you: Open Gate never fetches festival sites. */
export interface Festival {
  id: Id;
  name: string;
  url?: string;
  platform: 'filmfreeway' | 'site' | 'other';
  location?: string;
  eventStart?: ISODate;
  eventEnd?: ISODate;
  tier: FestivalTier;
  /** Premiere status the festival requires. */
  premiere?: PremiereRule;
  category?: string;
  deadlines: FestivalDeadline[];
  /** The deadline you plan to hit (its fee is what's budgeted). */
  aim?: Id;
  /** Fee waiver code or note: a waived festival budgets $0. */
  waiver?: string;
  status: FestivalStatus;
  submittedOn?: ISODate;
  feePaid?: number;
  notifyDate?: ISODate;
  attend?: boolean;
  travel?: number;
  notes?: string;
}

export type FundingKind = 'cash' | 'inkind' | 'deferral' | 'grant' | 'investor' | 'crowdfunding' | 'sponsor' | 'presale' | 'incentive' | 'loan' | 'other';
export type FundingStatus = 'idea' | 'applied' | 'pledged' | 'received';

/** One source of money (or in-kind value) for the film. */
export interface FundingSource {
  id: Id;
  kind: FundingKind;
  name: string;
  amount: number;
  status: FundingStatus;
  /** When the money arrives (incentives and some grants come after the shoot). */
  date?: ISODate;
  notes?: string;
}

/** A crowdfunding reward tier, for working out fulfilment costs. */
export interface RewardTier {
  id: Id;
  name: string;
  /** Pledge amount for this tier. */
  price: number;
  /** Expected number of backers at this tier. */
  backers: number;
  /** Cost to make one reward (print, item, packaging). */
  costEach: number;
  /** Postage per reward (0 for digital). */
  shipEach: number;
}

export interface CrowdPlan {
  platform: string;
  /** Platform fee, % of money raised. */
  feePct: number;
  /** Payment processing, % of each pledge… */
  processingPct: number;
  /** …plus a fixed amount per pledge. */
  perPledge: number;
  /** Pledge manager or fulfilment service, % of money raised. */
  pledgeMgrPct: number;
  /** Set aside for tax on rewards / income, % of money raised. */
  taxReservePct: number;
  /** Share of money pledged with no reward (a straight donation), %. */
  noRewardPct: number;
  tiers: RewardTier[];
}

export interface FundingPlan {
  /** Pages shot per day, for estimating shoot days before there's a schedule. */
  pagesPerDay?: number;
  /** Which starter rates "Quick estimate" fills in. */
  level?: 'none' | 'micro' | 'indie';
  crowd?: CrowdPlan;
}

/** A copy of a union agreement the production signed (a PDF kept with the budget). */
export interface SignedAgreement { id: Id; guildId: string; title: string; fileId: Id; added: string }

// ---------- Paperwork, unions, clearances, time cards ----------

export type UnionStatus = 'nonunion' | 'member' | 'ficore' | 'taft-hartley' | 'pending';

/** A person paperwork belongs to: a cast member, crew member, contact or location. */
export interface PersonRef { kind: 'cast' | 'crew' | 'contact' | 'location'; id: Id }

export type PaperKind = 'deal' | 'nda' | 'crew' | 'talent' | 'appearance' | 'location' | 'minor' | 'w9' | 'w4' | 'i9' | 'other';
export type PaperStatus = 'draft' | 'sent' | 'signed' | 'received' | 'na';

/** The terms of a deal memo; the rate goes into that person's budget line. */
export interface DealTerms {
  rate: number;
  per: 'day' | 'week' | 'flat';
  kitFee?: number;
  kitPer?: 'day' | 'week' | 'flat';
  guaranteedDays?: number;
  /** Overtime after this many hours, at this multiplier (defaults from payroll rules). */
  otAfter?: number;
  otMult?: number;
  /** Paid as a contractor (1099 / W-9) rather than through payroll. */
  contractor?: boolean;
}

export interface PaperDoc {
  id: Id;
  kind: PaperKind;
  person: PersonRef;
  title: string;
  status: PaperStatus;
  /** Filled-in template text (releases, deal memos). */
  body?: string;
  /** Signed copy or scan (media id). */
  fileId?: Id;
  /** Signed in Open Gate: typed name, drawn signature image (media id), when. */
  signature?: { name: string; mediaId?: Id; at: string };
  deal?: DealTerms;
  /** Where a start form is kept ("accountant's folder") — never its contents. */
  where?: string;
  /** Minor work permits, location releases…: when it runs out. */
  expires?: ISODate;
  notes?: string;
  updated: string;
}

export type ClearanceKind = 'location' | 'artwork' | 'logo' | 'name' | 'phone' | 'address' | 'web' | 'archival' | 'minor' | 'music' | 'other';
export type ClearanceStatus = 'needed' | 'requested' | 'cleared' | 'replace' | 'na';

export interface Clearance {
  id: Id;
  kind: ClearanceKind;
  /** What needs clearing: the brand, name, number, artwork… */
  item: string;
  sceneIds: Id[];
  status: ClearanceStatus;
  /** Found by the script scan, or added by hand. */
  source: 'scan' | 'manual';
  /** Release or other paperwork that covers it. */
  docId?: Id;
  fileId?: Id;
  notes?: string;
  /** For a location clearance: the location in Plan → Locations. */
  locationId?: Id;
}

export interface TimeCard {
  id: Id;
  dayId: Id;
  person: PersonRef;
  /** "HH:MM" (24 h). Out before in = past midnight. */
  in?: string;
  mealOut?: string;
  mealIn?: string;
  out?: string;
  notes?: string;
}

export interface PayrollRules {
  /** Overtime (1.5×) after this many hours, double time (2×) after this many. */
  otAfter: number;
  dtAfter: number;
  /** A meal break is due within this many hours of call (and of the last meal). */
  mealEvery: number;
  /** Amount per meal penalty (0 = count only). */
  mealPenalty: number;
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

// ---------- Script drafts & revisions ----------

/** Industry revision colours, in order. */
export type RevisionColor = 'white' | 'blue' | 'pink' | 'yellow' | 'green' | 'goldenrod' | 'buff' | 'salmon' | 'cherry';

/** A frozen copy of the script. The doc is gzip-compressed JSON (base64) to keep projects small. */
export interface ScriptDraft {
  id: Id;
  name: string;
  createdAt: string;
  author?: string;
  /** Saved automatically (once a day while writing, or before an import / restore). */
  auto?: 'daily' | 'import' | 'restore';
  /** 'z:' + base64 gzip of the doc JSON, or 'j:' + plain JSON where compression isn't available. */
  data: string;
  pages: number;
  scenes: number;
  words: number;
  /** The revision colour the script was in when saved. */
  color?: RevisionColor;
}

/** Production revisions: changes since the base draft are marked and printed in this colour. */
export interface ScriptRevision {
  color: RevisionColor;
  baseDraftId: Id;
  date: string;
  /** Keep page numbers from the base draft; pages that grow get A, B suffixes. */
  lockPages?: boolean;
}

/** An alternate version of one scene ("Ending B"), swapped in and out of the script. */
export interface SceneVariant {
  id: Id;
  sceneId: Id;
  name: string;
  /** The scene's blocks (ProseMirror JSON nodes), heading included. */
  blocks: unknown[];
  createdAt: string;
}

// ---------- Story Bible ----------

export type BibleGenre = 'contemporary' | 'fantasy' | 'scifi' | 'horror' | 'period';

export interface StoryPlace { id: Id; name: string; description: string; locationId?: Id; imageId?: Id }
export interface StoryGroup { id: Id; name: string; description: string; members: string[] }
export interface GlossaryEntry { id: Id; term: string; meaning: string }
export interface WorldRule { id: Id; title: string; text: string }
/** Something that happens in the story's timeline that isn't a scene (backstory, off-screen events). */
export interface StoryEvent { id: Id; day: number; title: string; text?: string }

export interface StoryBible {
  genre: BibleGenre;
  logline: string;
  synopsis: string;
  tone: string;
  themes: string[];
  places: StoryPlace[];
  groups: StoryGroup[];
  glossary: GlossaryEntry[];
  rules: WorldRule[];
  events: StoryEvent[];
  /** Mood boards linked to the bible. */
  boardIds: Id[];
}

// ---------- End credits ----------

export type CreditStyle = 'card' | 'columns' | 'centered' | 'names';

/** How the end credits are arranged. The names come live from the project; these are the choices. */
export interface CreditsSettings {
  /** Block ids in order (automatic blocks and your own). */
  order: string[];
  headings: Record<string, string>;
  styles: Record<string, CreditStyle>;
  hiddenBlocks: string[];
  /** `${blockId}|${lineKey}` of single names left out. */
  hiddenLines: string[];
  custom: { id: Id; heading: string; style: CreditStyle; lines: { role?: string; name: string }[] }[];
  /** Special thanks, one per line. */
  thanks: string;
  copyright?: string;
  legal: { animals?: boolean; fiction?: boolean; openGate?: boolean };
  castOrder: 'number' | 'appearance' | 'alpha';
  /** Scroll speed: seconds for one screen height. */
  secondsPerScreen: number;
  /** Fixed runtime in seconds (otherwise worked out from the length). */
  runtime?: number;
  /** Leave society letters (ASC, ACE…) off names. */
  noSocietyLetters?: boolean;
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
  drafts?: ScriptDraft[];
  revision?: ScriptRevision;
  sceneVariants?: SceneVariant[];
  /** Name of the version of each scene that's in the script now (default "Original"). */
  sceneVariantActive?: Record<Id, string>;
  /** Save a draft automatically once a day while writing (default on). */
  autoDrafts?: boolean;
  /** Story structure used for beat markers in the Scenes list (Reference → Story structures). */
  structure?: { frameworkId: string };
  bible?: StoryBible;
  credits?: CreditsSettings;
  characterOptions?: CharacterOptions;
  /** The union list (Settings → Unions); built-in list when unset. */
  unionOptions?: UnionOption[];
  /** The honorary societies list (Settings → Unions & Societies); built-in list when unset. */
  societyOptions?: SocietyOption[];
  /** Where each character sits on the relationship map (by name). */
  characterMap: Record<string, { x: number; y: number }>;
  notes: string;
  /** Present when this project is shared through a relay. */
  share?: ShareInfo;
}

/** A union in the Settings list. */
export interface UnionOption { id: string; name: string; group: string; locals?: string[]; custom?: boolean; hidden?: boolean }

/** An honorary society in the Settings list, with how its letters are written. */
export interface SocietyOption { id: string; abbr: string; name: string; craft: string; letters: string; custom?: boolean; hidden?: boolean }
