// Guilds, unions and honorary societies: what each one is, why it matters to an indie production,
// the rules in plain language, what happens when they're broken, and the agreements that fit.
//
// Written for Open Gate in our own words from each organisation's official site (and its published
// agreements) on the date in CHECKED. No rate sheets are copied: numbers go stale, so pages link to
// the union's own. Anything we couldn't confirm from an official source says "unconfirmed".

export const CHECKED = '2026-10-22';
export const LEGAL_NOTE = 'A summary, not legal advice. Read the full agreement or ask the union before you rely on it.';

export type GuildKind = 'overview' | 'union' | 'society';
export type GuildRegion = 'Overview' | 'United States' | 'Canada' | 'United Kingdom' | 'Australia & New Zealand' | 'Honorary societies';

export interface Agreement { name: string; fits: string; budget?: string; url?: string }

export interface Guild {
  id: string;
  /** Short name / letters (SAG-AFTRA, ASC). */
  abbr: string;
  name: string;
  kind: GuildKind;
  region: GuildRegion;
  url: string;
  /** Who it represents (or honours), in a sentence or two. */
  summary: string;
  why?: string;
  rules?: string[];
  /** Only what an official source confirms. */
  consequences?: string[];
  agreements?: Agreement[];
  /** Societies: how the letters are written after a name. */
  letters?: string;
  /** Extra search words: nicknames and old names. */
  aka?: string;
  sources: { label: string; url: string }[];
  /** Union name as it appears in the Union picker, when it's in the list. */
  unionName?: string;
}

const SAG_SHEET = 'https://www.sagaftra.org/sites/default/files/2024-10/Low%20Budget%20Entertainment%20Contracts%20One%20Sheet.pdf';

export const GUILDS: Guild[] = [
  // ------------------------------------------------------------------ overview
  {
    id: 'unions-vs-societies', abbr: 'Overview', name: 'Unions, guilds and honorary societies', kind: 'overview', region: 'Overview', url: 'https://www.nlrb.gov',
    summary: 'A union (many film unions call themselves guilds) bargains with producers on behalf of its members: minimum pay, hours, safety, pension and health, credits. An honorary society is something else: you’re invited in for the quality of your work, you get letters after your name (Jane Doe, ASC), and it sets no pay or working rules.',
    why: 'A union affects who you can hire, what you must pay and the paperwork you file. A society only affects how someone’s name appears in the credits. Open Gate keeps them as two separate fields for that reason.',
    rules: [
      '“Guild” is a name, not a different legal thing: SAG-AFTRA, the DGA and the WGA are unions.',
      'Union rules bind a production only once the production signs that union’s agreement (becomes “signatory”).',
      'Society letters go in the credits only for members; a society never “covers” a production.',
    ],
    aka: 'guild union society letters difference',
    sources: [{ label: 'SAG-AFTRA Production Center', url: 'https://www.sagaftra.org/production-center' }, { label: 'American Cinema Editors: about ACE', url: 'https://americancinemaeditors.org/about-ace/' }],
  },
  {
    id: 'going-union', abbr: 'Overview', name: 'Going union as an indie: signatory basics', kind: 'overview', region: 'Overview', url: 'https://www.sagaftra.org/production-center',
    summary: 'To hire union members under a union’s terms, your production company signs that union’s agreement and becomes a signatory. Each union does this separately: being signatory to SAG-AFTRA doesn’t make you signatory to IATSE or the DGA.',
    why: 'Most professional actors in the US are SAG-AFTRA members and can’t work on a non-signatory production without risking union discipline. Low-budget agreements exist so small films can still hire them.',
    rules: [
      'Start early. SAG-AFTRA asks producers to begin at least 3 weeks before the first day of travel, rehearsal or shooting, and says not to start any of those until the project is cleared.',
      'Expect to send: company documents (who employs the actors), the script, a schedule or Day Out of Days, a detailed budget, and chain-of-title papers (who owns the story).',
      'The union may ask for financial assurances, such as a security deposit, before it clears the production.',
      'During and after the shoot: performer contracts, weekly time reports, Taft-Hartley reports for non-members, a final cast list and a final cost report (SAG-AFTRA’s low-budget guide).',
    ],
    consequences: ['Shooting with members before you’re cleared can put them in breach of union rules; SAG-AFTRA publishes “Do Not Work” notices for productions that haven’t completed the signatory process.'],
    aka: 'signatory clearance sign become union production',
    sources: [{ label: 'SAG-AFTRA: Producer’s guide to the low budget agreements', url: 'https://www.sagaftra.org/files/producers_guide_low_budget_9_32.pdf' }, { label: 'SAG-AFTRA Production Center', url: 'https://www.sagaftra.org/production-center' }, { label: 'SAG-AFTRA Do Not Work notice (example)', url: 'https://www.sagaftra.org/do-not-work-notice-hibernation' }],
  },
  {
    id: 'taft-hartley', abbr: 'Overview', name: 'Taft-Hartley explained', kind: 'overview', region: 'Overview', url: 'https://www.sagaftra.org/files/taft_hartley_info.pdf',
    summary: 'On a SAG-AFTRA production you can hire a performer who isn’t a member, but the producer (or casting director) must report it to the union on a Taft-Hartley report. The name comes from the 1947 US labour law that shaped union hiring rules.',
    why: 'It’s how indies cast newcomers on a union show, and it’s how many actors become eligible to join.',
    rules: [
      'The producer or casting director files it; the union won’t accept one from the performer.',
      'SAG-AFTRA’s New Media sheet says to file within 15 days of the performer’s work date; deadlines can differ by agreement, so check yours.',
      'A non-member principal performer becomes eligible to join after one principal Taft-Hartley report; background performers need three days of covered work.',
      'Reports aren’t processed until the production’s final paperwork is in (cast clearance, time reports, contracts, final cast list).',
    ],
    consequences: ['SAG-AFTRA’s production checklist describes a union security violation, with possible liquidated damages, when a performer who must join doesn’t pay initiation and dues within the required time (unconfirmed for every agreement: check yours).'],
    aka: 'taft hartley th non-member nonunion report eligible join',
    sources: [{ label: 'SAG-AFTRA: Taft-Hartley information', url: 'https://www.sagaftra.org/files/taft_hartley_info.pdf' }, { label: 'SAG-AFTRA: Producer’s guide to the low budget agreements', url: 'https://www.sagaftra.org/files/producers_guide_low_budget_9_32.pdf' }],
  },
  {
    id: 'fringes', abbr: 'Overview', name: 'Fringes: pension, health and payroll taxes', kind: 'overview', region: 'Overview', url: 'https://www.sagaftra.org/production-center',
    summary: 'Fringes are the costs on top of a wage. Payroll taxes and workers’ comp apply to employees whether or not they’re union. Union agreements add pension and health contributions, a percentage of each member’s pay sent to the union’s benefit plans.',
    why: 'They’re easy to forget and can add a large share on top of union wages. Budget them from the start.',
    rules: [
      'The percentage is set by each agreement and changes: read it from the union’s current rate sheet, don’t guess.',
      'Some contributions are capped per person; Open Gate’s fringes support caps and per-person limits.',
      'A payroll company that handles union productions will calculate and remit them for you.',
    ],
    aka: 'p&h pension health fringe benefits payroll tax',
    sources: [{ label: 'SAG-AFTRA: Low budget contracts one-sheet (rates link to each rate sheet)', url: SAG_SHEET }],
  },
  {
    id: 'financial-core', abbr: 'Overview', name: 'Financial core (fi-core)', kind: 'overview', region: 'Overview', url: 'https://www.nlrb.gov/about-nlrb/rights-we-protect/the-law/employees/union-dues',
    summary: 'In the US, a worker covered by a union contract can choose to be a non-member who pays only the part of the dues tied to bargaining and representation (often called “financial core”). Their rights here come from US labour law and court decisions, not from the union.',
    why: 'A fi-core performer can legally work on some non-union jobs, but the union treats them as a non-member. If a fi-core actor is in your cast, record it, and check how your agreement treats them.',
    rules: ['In the 27 US states that ban union-security agreements, joining and paying dues is each worker’s choice (NLRB).', 'Union rules for fi-core workers differ; we couldn’t confirm a single published rule from SAG-AFTRA, so treat specifics as unconfirmed and ask the union.'],
    aka: 'fi-core ficore beck objector nonmember dues',
    sources: [{ label: 'NLRB: union dues and your rights', url: 'https://www.nlrb.gov/about-nlrb/rights-we-protect/the-law/employees/union-dues' }],
  },

  // ------------------------------------------------------------------ United States
  {
    id: 'sag-aftra', abbr: 'SAG-AFTRA', unionName: 'SAG-AFTRA', name: 'Screen Actors Guild – American Federation of Television and Radio Artists', kind: 'union', region: 'United States', url: 'https://www.sagaftra.org',
    summary: 'The US union for actors, background performers, stunt performers, singers, voice actors and broadcasters.',
    why: 'Most professional US screen actors are members. To cast them, the production signs one of SAG-AFTRA’s agreements; the low-budget ones are built for indies.',
    rules: [
      'All low-budget entertainment contracts require shooting entirely in the US.',
      'Become signatory and get the project cleared before travel, rehearsal or principal photography (see “Going union”).',
      'Weekly time reports (Exhibit G), performer contracts, Taft-Hartley reports for non-members, and final cast and cost reports.',
      'Nudity or simulated sex needs a rider; if there are stunts, a stunt coordinator is required (per the one-sheet).',
      'The first release decides how residuals are paid; talk to SAG-AFTRA’s residuals department.',
      'Budgets marked * can go higher using SAG-AFTRA’s diversity and background incentives.',
    ],
    consequences: [
      'SAG-AFTRA publishes “Do Not Work” notices for productions that haven’t completed the signatory process; members who work on them may face union discipline (Global Rule One).',
      'A union security violation can bring a claim with liquidated damages (production checklist).',
    ],
    agreements: [
      { name: 'Micro-Budget Project', fits: 'Very small single or episodic projects; limited exhibition', budget: '$20K', url: 'https://www.sagaftra.org/Micro' },
      { name: 'Student Film', fits: 'Students at accredited schools; classroom exhibition; 35 min max', budget: '$35K', url: 'https://www.sagaftra.org/Student' },
      { name: 'Short Project (SPA)', fits: 'Shorts up to 40 min; festivals, theatres or online', budget: '$50K', url: 'https://www.sagaftra.org/SPA' },
      { name: 'Ultra Low Project (UPA)', fits: 'Single projects, any first exhibition; professional performers only', budget: '$300K*', url: 'https://www.sagaftra.org/UPA' },
      { name: 'Moderate Low (MPA)', fits: 'Single projects, any first exhibition', budget: '$700K*', url: 'https://www.sagaftra.org/ModLow' },
      { name: 'Low Budget (LBA)', fits: 'Theatrical features, 80 min minimum', budget: '$2M', url: 'https://www.sagaftra.org/Low' },
      { name: 'Vertical Agreement', fits: 'Chapters of about 3 min or less for mobile apps', budget: '$300K*', url: 'https://www.sagaftra.org/Verticals' },
      { name: 'New Media (Deferrable)', fits: 'Episodic new media', budget: 'Under $50K', url: 'https://www.sagaftra.org/NewMedia' },
      { name: 'Special New Media A / B / C / D', fits: 'Episodic (A, B) or single/episodic (C, D) new media', budget: '<$300K / <$700K / <$1M / $1M+', url: 'https://www.sagaftra.org/SpecialNM' },
    ],
    aka: 'sag aftra screen actors guild actors performers union',
    sources: [{ label: 'SAG-AFTRA: Low budget entertainment contracts one-sheet (Oct 2026)', url: SAG_SHEET }, { label: 'SAG-AFTRA Production Center', url: 'https://www.sagaftra.org/production-center' }, { label: 'SAG-AFTRA: Producer’s guide to the low budget agreements', url: 'https://www.sagaftra.org/files/producers_guide_low_budget_9_32.pdf' }],
  },
  {
    id: 'iatse', abbr: 'IATSE', unionName: 'IATSE', name: 'International Alliance of Theatrical Stage Employees', kind: 'union', region: 'United States', url: 'https://www.iatse.net',
    summary: 'The union for most below-the-line film and TV crew in the US and Canada, organised in locals by craft and region (camera, sound, editors, grips, electric, props, hair and makeup, costume, art, script supervisors…).',
    why: 'If you hire IA crew, the production signs an IATSE agreement, and the local for each craft has its own rules and rates.',
    rules: [
      'There’s a national Low Budget Theatrical Agreement with budget tiers; the current tier limits weren’t confirmable from an IATSE source, so check with IATSE.',
      'Past versions kept daily and weekend turnaround (rest between days) and triple time after 15 hours (ICG 600 summary of the 2017 agreement).',
      'Locals also offer area and low-budget agreements (for example ICG 669 in Western Canada lists a Low Budget Agreement).',
    ],
    consequences: ['Locals have picketed non-union productions in their area (e.g. Chicago’s Local 476).'],
    agreements: [{ name: 'Low Budget Theatrical Agreement', fits: 'Theatrical features under its top tier; tiers by budget', budget: 'Tiers: unconfirmed for 2026', url: 'https://www.iatse.net' }],
    aka: 'ia iatse crew local locals stagehands',
    sources: [{ label: 'ICG 600: IATSE Low Budget Theatrical Agreement', url: 'https://www.icg600.com/news-articles/news/iatse-reaches-agreement-low-budget-theatrical-agreement' }, { label: 'ICG 669: about us', url: 'https://icg669.com/about-us' }, { label: 'Reel Chicago: Local 476 pickets', url: 'https://reelchicago.com/article/local-476-pickets' }],
  },
  {
    id: 'iatse-locals', abbr: 'IATSE locals', name: 'IATSE locals: who covers what', kind: 'overview', region: 'United States', url: 'https://www.iatse.net',
    summary: 'IATSE crew belong to a local for their craft and region. These are the ones Open Gate suggests; your area may have others.',
    rules: [
      'Local 600: International Cinematographers Guild (camera, US).',
      'Local 667: camera professionals, publicists, on-set VFX and special equipment operators, based in Toronto (its own site).',
      'Local 669 (ICG 669): camera in Western Canada: BC, Alberta, Saskatchewan, Manitoba and the territories (its own site).',
      'Local 52: motion picture studio mechanics (grip, electric and more) in the New York area.',
      'Local 161: script supervisors and production office coordinators, East Coast.',
      'Local 476: studio mechanics in Chicago.',
      'Local 839: The Animation Guild (Los Angeles).',
      'Local 892: Costume Designers Guild (Los Angeles).',
      'Locals 700 (editors), 695 (sound), 728 (electric), 80 (grips), 44 (props), 706 (makeup & hair), 705 (costume), 800 (art directors), 871 (script supervisors): Los Angeles-area locals; confirm current coverage with each.',
    ],
    aka: 'local 600 667 669 52 161 476 839 892 700 695 728 80 44 706 705 800 871',
    sources: [{ label: 'IATSE 667', url: 'https://www.iatse667.com' }, { label: 'ICG 669: about us', url: 'https://icg669.com/about-us' }, { label: 'Costume Designers Guild', url: 'https://costumedesignersguild.com' }, { label: 'The Animation Guild: about', url: 'https://animationguild.org/about-the-guild/' }],
  },
  {
    id: 'teamsters', abbr: 'Teamsters', unionName: 'Teamsters', name: 'International Brotherhood of Teamsters: Motion Picture Division', kind: 'union', region: 'United States', url: 'https://teamster.org',
    summary: 'Teamsters locals represent production drivers, location professionals and casting directors and associates. Local 399 covers Hollywood; Local 817 covers New York (drivers, casting, and location managers and scouts).',
    why: 'Union drivers, location managers or casting directors mean a Teamsters agreement for those roles.',
    rules: ['Rules and rates are set by each local’s agreement; contact the local for low-budget terms (none confirmed here).'],
    agreements: [{ name: 'Local 399 (Hollywood)', fits: 'Drivers, casting, locations', url: 'https://www.ht399.org' }, { name: 'Local 817 (New York)', fits: 'Drivers, casting, location managers and scouts', url: 'https://teamsters.nyc/locals/local-817/' }],
    aka: 'teamsters 399 817 drivers casting location managers',
    sources: [{ label: 'Teamsters Local 817', url: 'https://teamsters.nyc/locals/local-817/' }, { label: 'Hollywood Teamsters Local 399', url: 'https://www.ht399.org' }],
  },
  {
    id: 'dga', abbr: 'DGA', unionName: 'DGA', name: 'Directors Guild of America', kind: 'union', region: 'United States', url: 'https://www.dga.org',
    summary: 'The US union for directors and members of the directorial team: unit production managers, assistant directors and associate directors.',
    why: 'A DGA director brings DGA terms for the director and usually the UPM and ADs too.',
    rules: [
      'The Low Budget Sideletter covers scripted films intended for theatrical release with budgets up to $11 million, in levels.',
      'From July 2026: employers submit a Final Cost Statement before principal photography; wrap supervision and completion-of-assignment pay apply at some levels.',
    ],
    agreements: [{ name: 'Low Budget Sideletter, Levels 1a–4c (Jul 2026 – Jun 2027)', fits: 'Theatrical scripted features', budget: '1a ≤ $500K · 1b $500K–1.1M · 2 $1.1–3M · 3 $3–4M · 4a $4–5.5M · 4b $5.5–8.5M · 4c $8.5–11M', url: 'https://www.dga.org/news/guild-news/2026/september2026/2026-changes2lowbudgettheatricalsideletter' }],
    aka: 'dga directors guild ad upm assistant director',
    sources: [{ label: 'DGA: 2026 changes to the Low Budget Theatrical Sideletter', url: 'https://www.dga.org/news/guild-news/2026/september2026/2026-changes2lowbudgettheatricalsideletter' }, { label: 'DGA: Low Budget Agreements', url: 'https://dga.org/Contracts/Agreements/Low-Budget' }],
  },
  {
    id: 'wga', abbr: 'WGA', unionName: 'WGA', name: 'Writers Guild of America (West and East)', kind: 'union', region: 'United States', url: 'https://www.wga.org',
    summary: 'The US union for screen and TV writers, in two branches: WGA West and WGA East.',
    why: 'Hiring a WGA writer, or buying a WGA member’s script, means signing a WGA agreement.',
    rules: ['The Low Budget Agreement covers films with a total production cost up to $1.2 million, with lower minimums in tiers below $200K and $200K–$500K (WGA East form, 2025).'],
    agreements: [{ name: 'Low Budget Agreement', fits: 'Features up to $1.2M total cost', budget: '≤ $1.2M (tiers <$200K, $200K–$500K, $500K–$1.2M)', url: 'https://www.wgaeast.org/wp-content/uploads/sites/4/2025/09/LBA-Filings25.pdf' }],
    aka: 'wga writers guild screenwriter',
    sources: [{ label: 'WGA East: Low Budget Agreement filing (2025)', url: 'https://www.wgaeast.org/wp-content/uploads/sites/4/2025/09/LBA-Filings25.pdf' }, { label: 'WGA West', url: 'https://www.wga.org' }],
  },
  {
    id: 'afm', abbr: 'AFM', unionName: 'AFM', name: 'American Federation of Musicians', kind: 'union', region: 'United States', url: 'https://www.afm.org',
    summary: 'The union for musicians in the US and Canada, including those recording film scores.',
    why: 'Union musicians on your score means an AFM agreement; it also brings pension and health contributions and later secondary-market payments to the musicians.',
    rules: [
      'The current film framework is a memorandum amending the Basic Theatrical and TV Motion Picture Agreements (May 2024 – May 2027).',
      'Using the low-budget portion needs the Federation’s written approval first.',
      'An Independent/Festival Film agreement has covered films budgeted at $2 million or less (2016 AFM workshop; confirm it’s current).',
    ],
    agreements: [{ name: 'Independent / Festival Film Agreement', fits: 'Festival and indie films', budget: '≤ $2M (confirm current)', url: 'https://www.afm.org' }],
    aka: 'afm musicians score composer recording',
    sources: [{ label: 'AFM Local 47: theatrical motion picture & TV film', url: 'https://afm47.org/mptv_film.html' }, { label: 'AFM Local 47: low budget signatory workshop (2016)', url: 'https://afm47.org/downloads/Low%20Budget%20Signatory%20Workshop%202016.pdf' }],
  },
  {
    id: 'tag', abbr: 'TAG', unionName: 'The Animation Guild', name: 'The Animation Guild (IATSE Local 839)', kind: 'union', region: 'United States', url: 'https://animationguild.org',
    summary: 'The IATSE local for animation artists, technicians, writers and production workers (over 6,000 members, by its own count).',
    why: 'Relevant if your project has animated sequences made by a studio under TAG’s contract.',
    aka: 'tag animation guild 839 animators',
    sources: [{ label: 'The Animation Guild: about', url: 'https://animationguild.org/about-the-guild/' }],
  },
  {
    id: 'cdg', abbr: 'CDG', unionName: 'Costume Designers Guild', name: 'Costume Designers Guild (IATSE Local 892)', kind: 'union', region: 'United States', url: 'https://costumedesignersguild.com',
    summary: 'The IATSE local for costume designers, assistant costume designers and illustrators in film, TV and commercials, centred in Los Angeles.',
    aka: 'cdg costume designers 892',
    sources: [{ label: 'Costume Designers Guild', url: 'https://costumedesignersguild.com' }],
  },

  // ------------------------------------------------------------------ Canada
  {
    id: 'actra', abbr: 'ACTRA', unionName: 'ACTRA', name: 'Alliance of Canadian Cinema, Television and Radio Artists', kind: 'union', region: 'Canada', url: 'https://www.actra.ca',
    summary: 'The Canadian union for performers in recorded media. Producers work with ACTRA through the Independent Production Agreement (IPA) and its low-budget programmes, run by regional branches.',
    rules: [
      'ACTRA Indie Production (AIP): a low-budget version of the IPA. Branches give different ceilings (C$250,000 in Ottawa and the Maritimes, $300,000 in Manitoba), so check yours.',
      'Apply at least a month before your start date; casting and shooting can’t start until it’s approved.',
      'Generally needs 10/10 Canadian content points (CAVCO) and a Canadian-incorporated company; features need a final audit.',
      'Member Initiated Production (MIP): members form a partnership that produces the project.',
    ],
    agreements: [{ name: 'ACTRA Indie Production (AIP)', fits: 'Low-budget Canadian productions', budget: 'C$250K–300K depending on branch', url: 'https://actraottawa.ca/low-budget-agreements/' }, { name: 'Independent Production Agreement (IPA)', fits: 'Most independent Canadian productions', url: 'https://www.actra.ca' }],
    aka: 'actra canada performers ipa aip mip',
    sources: [{ label: 'ACTRA Ottawa: low budget agreements', url: 'https://actraottawa.ca/low-budget-agreements/' }, { label: 'ACTRA Manitoba: local agreements', url: 'https://actramanitoba.ca/local-agreements/' }, { label: 'ACTRA: Indie Production guidelines', url: 'https://actra.ca/wp-content/uploads/2020/03/OA-ACTRA-Indie-Production-Agreement.pdf' }],
  },
  {
    id: 'dgc', abbr: 'DGC', unionName: 'DGC', name: 'Directors Guild of Canada', kind: 'union', region: 'Canada', url: 'https://www.dgc.ca',
    summary: 'The Canadian union for directors, production managers, assistant directors, editors, location staff and other key creative and logistics roles.',
    rules: ['A new CMPA–DGC standard agreement took effect on 1 January 2026, covering Canada except BC and Quebec, with schedules by province; BC has its own agreement. Low-budget terms weren’t confirmed: ask the DGC.'],
    aka: 'dgc directors guild canada',
    sources: [{ label: 'CMPA: labour agreements and fees', url: 'https://cmpa.ca/labour-agreements-and-fees/' }],
  },
  {
    id: 'iatse-canada', abbr: 'IATSE Canada', unionName: 'IATSE Canada', name: 'IATSE in Canada', kind: 'union', region: 'Canada', url: 'https://www.iatse.net',
    summary: 'IATSE’s Canadian locals cover film crew by craft and region, including camera locals 667 (based in Toronto) and 669 (Western Canada).',
    rules: ['ICG 669’s main contracts include a BC/Yukon agreement, the Western Canada Agreement and a Low Budget Agreement; 667 and 669 members can work in each other’s regions under that local’s agreement, at the producer’s request.'],
    aka: 'iatse canada 667 669 873 891',
    sources: [{ label: 'ICG 669: about us', url: 'https://icg669.com/about-us' }, { label: 'IATSE 667', url: 'https://www.iatse667.com' }],
  },

  // ------------------------------------------------------------------ UK
  {
    id: 'equity-uk', abbr: 'Equity', unionName: 'Equity (UK)', name: 'Equity (UK)', kind: 'union', region: 'United Kingdom', url: 'https://www.equity.org.uk',
    summary: 'The UK union for performers and creative practitioners. Film terms for actors are set in the Pact/Equity Cinema Films Agreement.',
    rules: [
      'Low-budget films register with Pact: under £1 million as a Very Low Budget Film, £1–3 million as a Low Budget Film.',
      'They pay lower use fees (50% and 75%) in return for a bigger share of net profits for the cast.',
      'Rates change each year: use Pact’s current digest.',
    ],
    agreements: [{ name: 'Pact/Equity Cinema Films Agreement: Very Low Budget', fits: 'UK features', budget: '< £1M' }, { name: 'Pact/Equity Cinema Films Agreement: Low Budget', fits: 'UK features', budget: '£1M–£3M' }],
    aka: 'equity uk british actors pact',
    sources: [{ label: 'Pact: Equity cinema films digest', url: 'https://www.pact.co.uk/static/ff287f45-57aa-45ba-80e915bca3758542/DIGEST-Pact-Equity-Cinema-Films-6th-April-2022-thru-5th-April-2023.pdf' }, { label: 'Equity: know your rights', url: 'https://www.equity.org.uk/advice-and-support/know-your-rights' }],
  },
  {
    id: 'bectu', abbr: 'BECTU', unionName: 'BECTU', name: 'Bectu (part of Prospect)', kind: 'union', region: 'United Kingdom', url: 'https://bectu.org.uk',
    summary: 'The UK union for crew and behind-the-scenes workers in film, TV and live events.',
    rules: [
      'There’s no collective agreement for low-budget UK films: talks between Pact and Bectu didn’t reach one.',
      'In June 2026 Pact published a non-binding “Red Book” of recommended crew terms for films budgeted £1–10 million (no rates included).',
      'The Pact/Bectu major motion picture agreement applies only to films of £30 million or more.',
    ],
    aka: 'bectu crew uk prospect red book',
    sources: [{ label: 'Pact: recommended terms for low budget films', url: 'https://www.pact.co.uk/resource/pact-issues-recommended-terms-for-low-budget-films.html' }, { label: 'Screen Daily: Pact guidelines for crew', url: 'https://www.screendaily.com/news/uks-pact-creates-guidelines-for-working-with-crew-on-low-budget-feature-films/5217968.article' }],
  },
  {
    id: 'directors-uk', abbr: 'Directors UK', unionName: 'Directors UK', name: 'Directors UK', kind: 'union', region: 'United Kingdom', url: 'https://directors.uk.com',
    summary: 'The professional association for UK screen directors; it negotiates terms with Pact and broadcasters and collects rights payments for directors.',
    rules: ['Pact negotiates collective agreements with Directors UK; we couldn’t confirm specific low-budget terms. Directors UK, Pact and the WGGB agreed a revenue-sharing deal for BFI Lottery-backed films (2015).'],
    aka: 'directors uk duk',
    sources: [{ label: 'Pact: collective agreements', url: 'https://www.pact.co.uk/how-we-support-the-industry/engaging-in-collective-agreements-hr-issues.html' }],
  },
  {
    id: 'wggb', abbr: 'WGGB', unionName: 'WGGB', name: 'Writers’ Guild of Great Britain', kind: 'union', region: 'United Kingdom', url: 'https://writersguild.org.uk',
    summary: 'The UK trade union for writers in film, TV, theatre, radio, books and games.',
    rules: ['Pact negotiates agreements with the WGGB; we couldn’t confirm specific low-budget film terms here: ask the WGGB.'],
    aka: 'wggb writers guild great britain uk',
    sources: [{ label: 'Pact: collective agreements', url: 'https://www.pact.co.uk/how-we-support-the-industry/engaging-in-collective-agreements-hr-issues.html' }],
  },

  // ------------------------------------------------------------------ Australia & NZ
  {
    id: 'meaa', abbr: 'MEAA', unionName: 'MEAA', name: 'Media, Entertainment & Arts Alliance (MEAA Equity)', kind: 'union', region: 'Australia & New Zealand', url: 'https://www.meaa.org',
    summary: 'The Australian union for performers (through MEAA Equity), crew and journalists.',
    rules: [
      'Feature film actors have been covered by an Actors Feature Film Collective Agreement negotiated with Screen Producers Australia; MEAA reports new agreements are being negotiated, so check which is current.',
      'Producers who are SPA members must use the MEAA–SPA agreements; other producers can use sample contracts (Arts Law).',
      'A dedicated low-budget feature agreement has been discussed for years; we couldn’t confirm one is in force.',
    ],
    aka: 'meaa equity australia actors',
    sources: [{ label: 'MEAA', url: 'https://www.meaa.org' }, { label: 'Arts Law Centre of Australia', url: 'https://artslaw.com.au' }],
  },
  {
    id: 'equity-nz', abbr: 'Equity NZ', unionName: 'Equity NZ', name: 'Equity New Zealand', kind: 'union', region: 'Australia & New Zealand', url: 'https://equity.org.nz',
    summary: 'The New Zealand union for performers.',
    rules: [
      'The old “Pink Book” code of practice was replaced by standard Individual Performance and Backend Agreements agreed with SPADA for NZ film and TV drama.',
      'Under the Screen Industry Workers Act 2022, Equity NZ negotiates a collective agreement with SPADA for performers, a baseline that individual contracts generally can’t undercut.',
    ],
    aka: 'equity nz new zealand pink book spada siwa',
    sources: [{ label: 'Equity NZ: resources', url: 'https://equity.org.nz/resources' }, { label: 'Equity NZ: SIWA quick guide', url: 'https://equity.org.nz/wp-content/uploads/2023/07/equity-nz-SIWA-Quick-Guide.pdf' }],
  },

  // ------------------------------------------------------------------ Honorary societies
  ...([
    ['asc', 'ASC', 'American Society of Cinematographers', 'Cinematographers (US-based, members worldwide)', 'https://theasc.com', 'ASC'],
    ['bsc', 'BSC', 'British Society of Cinematographers', 'Cinematographers (UK)', 'https://bscine.com', 'BSC'],
    ['csc', 'CSC', 'Canadian Society of Cinematographers', 'Cinematographers (Canada)', 'https://csc.ca', 'CSC'],
    ['acs', 'ACS', 'Australian Cinematographers Society', 'Cinematographers (Australia)', 'https://cinematographer.org.au', 'ACS'],
    ['nzcs', 'NZCS', 'New Zealand Cinematographers Society', 'Cinematographers (New Zealand)', 'https://nzcs.co.nz', 'NZCS'],
    ['afc', 'AFC', 'Association Française des directeurs de la photographie Cinématographique', 'Cinematographers (France)', 'https://www.afcinema.com', 'AFC'],
    ['bvk', 'BVK', 'Berufsverband Kinematografie', 'Cinematographers (Germany)', 'https://kinematografie.org', 'BVK'],
    ['aic', 'AIC', 'Associazione Italiana Autori della Fotografia Cinematografica', 'Cinematographers (Italy)', 'https://www.aicine.it', 'AIC'],
    ['aec', 'AEC', 'Asociación Española de Autores de Obras Fotográficas Cinematográficas', 'Cinematographers (Spain)', 'https://www.aecdirfot.org', 'AEC'],
    ['imago', 'IMAGO', 'IMAGO, the European Federation of Cinematographers', 'A federation of national cinematographer societies (members use their own society’s letters)', 'https://imago.org', ''],
    ['soc', 'SOC', 'Society of Camera Operators', 'Camera operators; the SOC negotiated with the AMPTP to put its initials after members’ screen credits', 'https://soc.org', 'SOC'],
    ['gbct', 'GBCT', 'Guild of British Camera Technicians', 'Camera crew (UK)', 'https://www.gbct.org', 'GBCT'],
    ['ace', 'ACE', 'American Cinema Editors', 'Film and TV editors. Not a union (that’s the Motion Picture Editors Guild, IATSE Local 700). Since June 2014 the letters are written ACE, without periods.', 'https://americancinemaeditors.org', 'ACE'],
    ['cce', 'CCE', 'Canadian Cinema Editors', 'Editors (Canada)', 'https://cceditors.ca', 'CCE'],
    ['cas', 'CAS', 'Cinema Audio Society', 'Production sound mixers and re-recording mixers', 'https://cinemaaudiosociety.org', 'CAS'],
    ['amps', 'AMPS', 'Association of Motion Picture Sound', 'Sound (UK)', 'https://www.amps.net', 'AMPS'],
    ['mpse', 'MPSE', 'Motion Picture Sound Editors', 'Sound editors', 'https://www.mpse.org', 'MPSE'],
    ['csa', 'CSA', 'Casting Society', 'Casting directors (formerly the Casting Society of America)', 'https://www.castingsociety.com', 'CSA'],
    ['lmgi', 'LMGI', 'Location Managers Guild International', 'Location managers and scouts (a professional organisation, not a union)', 'https://locationmanagers.org', 'LMGI'],
    ['ves', 'VES', 'Visual Effects Society', 'Visual effects artists and supervisors', 'https://www.vesglobal.org', 'VES'],
    ['csi', 'CSI', 'Colorist Society International', 'Colorists. By its own description not a labour union or guild, but an educational and cultural resource.', 'https://coloristsociety.com', 'CSI'],
  ] as const).map(([id, abbr, name, who, url, letters]): Guild => ({
    id, abbr, name, kind: 'society', region: 'Honorary societies', url, letters: letters || undefined,
    summary: `${who}. Membership is a professional honour; it sets no pay or working rules.`,
    why: letters ? `Members may put “${letters}” after their name in the credits. Open Gate adds it only for people you tick, in End credits and on call sheets.` : 'Its members use their national society’s letters.',
    rules: ['Letters only for current members; never add them for someone who isn’t one.', 'Check the society’s own guidance for exact styling (with or without periods). Ones we couldn’t confirm use the plain form; you can change it in Settings → Unions & Societies.'],
    aka: `${abbr.toLowerCase()} society letters credit ${name.toLowerCase()}`,
    sources: [{ label: name, url }],
  })),
  {
    id: 'pga', abbr: 'PGA', name: 'Producers Guild of America (and the p.g.a. mark)', kind: 'society', region: 'Honorary societies', url: 'https://producersguild.org', letters: 'p.g.a.',
    summary: 'A trade association for producers (not a union). Its Producers Mark, “p.g.a.” after a producer’s name, is certified project by project: it says the PGA found that person did a major part of the producing work on that film.',
    why: 'The mark isn’t membership. It goes in the credits only when the PGA has certified it for this production; earlier certifications don’t carry over.',
    rules: ['Open Gate asks “Certified by the PGA for this production?” before it adds p.g.a. to a name.', 'The PGA’s master rules describe the process for each kind of picture.'],
    aka: 'pga p.g.a. producers mark certification producers guild',
    sources: [{ label: 'PGA: Producers Mark rules (TV/streamed)', url: 'https://www.producersguildawards.com/Content/documents/PM_Master_Rules_TV_Streamed_Motion_Pictures.pdf' }, { label: 'Producers Guild of America', url: 'https://producersguild.org' }],
  },
];

export const guildById = (id: string) => GUILDS.find((g) => g.id === id);
/** The reference page for a union name from the Union picker. */
export const guildForUnion = (union?: string) => (union ? GUILDS.find((g) => g.unionName === union || g.abbr === union) : undefined);
