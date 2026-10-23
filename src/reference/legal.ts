import type { RefPage } from './topics';
import { MONEY_CHECKED } from './money';

// Legal & Insurance: what independent filmmakers need to know before they spend money or point a
// camera at anything they don't own. Written for Open Gate; no legal advice, sources where it
// states a rule or a figure.

export const LEGAL_REF_NOTE = 'A plain-language summary, not legal or insurance advice. Rules differ by country and state: check with an entertainment lawyer or an insurance broker before you rely on it.';

const SRC = {
  wrapbookIns: { label: 'Wrapbook: choosing the right production insurance', url: 'https://www.wrapbook.com/blog/choosing-the-right-insurance-policy' },
  studiobinderIns: { label: 'StudioBinder: the producer’s guide to film production insurance', url: 'https://studiobinder.com/blog/the-producers-guide-to-film-production-insurance' },
  copyright: { label: 'U.S. Copyright Office: fees', url: 'https://www.copyright.gov/about/fees.html' },
  copyrightCirc: { label: 'U.S. Copyright Office: Circular 2, copyright registration', url: 'https://www.copyright.gov/circs/circ02.pdf' },
  sba: { label: 'U.S. SBA: choose a business structure', url: 'https://www.sba.gov/business-guide/launch-your-business/choose-business-structure' },
  ukCompanies: { label: 'GOV.UK: set up a limited company', url: 'https://www.gov.uk/limited-company-formation' },
  faa: { label: 'FAA: certificated remote pilots including commercial operators (Part 107)', url: 'https://www.faa.gov/uas/commercial_operators' },
  caFilmDrones: { label: 'California Film Commission: drones for filming', url: 'https://cdn.film.ca.gov/wp-content/uploads/2021/10/Update-on-the-Use-of-UAS-Drones-For-Filming-Over-State-Property.pdf' },
  caa: { label: 'UK CAA: introduction to drone flying and the UK rules', url: 'https://caa.co.uk/drones/rules-and-categories-of-drone-flying/introduction-to-drone-flying-and-the-uk-rules' },
  tc: { label: 'Transport Canada: drone safety', url: 'https://tc.canada.ca/en/aviation/drone-safety' },
  casa: { label: 'CASA (Australia): drones', url: 'https://www.casa.gov.au/drones' },
  easa: { label: 'EASA: drones (civil drones, EU)', url: 'https://www.easa.europa.eu/en/domains/drones-air-mobility' },
};

const base = { checked: MONEY_CHECKED, notice: LEGAL_REF_NOTE, category: 'legal' as const };

export const LEGAL_PAGES: RefPage[] = [
  // ---------- Insurance ----------
  {
    ...base, id: 'insurance', group: 'Insurance', title: 'Production insurance', lead: 'What a policy covers, what locations and rental houses will ask for, and roughly what it costs.',
    sections: [
      { p: 'Insurance protects you when something goes wrong: someone is hurt, rented gear is broken, a location is damaged. Many locations, rental houses and city permit offices won’t let you work without it, and they’ll ask for a certificate of insurance (COI) naming them as additional insured.' },
      { h: 'A production package usually includes', p: 'General liability (injury or damage to other people and property; $1 million per occurrence is the usual minimum and often required for permits), equipment (owned and rented), third-party property damage, props, sets and wardrobe, hired and non-owned auto, and workers’ compensation (US) or employers’ liability (UK) for anyone who is an employee. Add-ons cover cast (an actor falling ill), faulty media, and extra expense.' },
      { h: 'Short-term policies', p: 'For a short you can buy cover just for the shoot days. A $1M general liability policy for a few days is often in the low hundreds of dollars; a package with equipment and other cover runs into the low thousands. Some guides suggest budgeting about 2.5% of the total. Get quotes from a broker who does film.' },
      { h: 'Tell them about risks', p: 'Stunts, animals, drones, vehicles on camera, water, pyrotechnics and weapons (even replicas) all need to be declared and usually need a rider or an approved specialist. Undeclared risk can void the policy. The Open Gate sample production budgets a stunts rider for exactly this reason.' },
    ],
    use: [{ tab: 'budget', label: 'Budget → Insurance (3600)' }, { tab: 'locations', label: 'Locations' }],
    sources: [SRC.wrapbookIns, SRC.studiobinderIns],
    topics: ['legal', 'production'], keywords: 'insurance general liability coi certificate additional insured equipment workers comp employers liability short term policy rider stunts drones animals',
  },
  {
    ...base, id: 'insurance-eo-bond', group: 'Insurance', title: 'E&O insurance and completion bonds', lead: 'Cover for rights claims, and a guarantee the film gets finished.',
    sections: [
      { p: 'Errors & omissions (E&O) insurance covers claims that the film infringed someone’s rights: copyright, trademarks, a name or likeness, defamation, privacy. Distributors and broadcasters usually require it before they release a film, and the insurer wants your clearance report, chain of title and releases first. Clean paperwork from day one makes it cheaper.' },
      { h: 'Completion bonds', p: 'On financed features, a completion guarantor promises the investors that the film will be finished and delivered on budget, and can step in if it isn’t. Shorts and micro-budget films don’t use them.' },
    ],
    use: [{ tab: 'paperwork', label: 'Paperwork → Clearances' }],
    topics: ['legal'], keywords: 'e&o errors omissions insurance completion bond guarantor distributor',
  },

  // ---------- Legal ----------
  {
    ...base, id: 'legal-company', group: 'Legal basics', title: 'Forming a production company', lead: 'Why most films are made by their own company.',
    sections: [
      { p: 'A separate company (a single-purpose LLC in the US, a limited company in the UK, a corporation in Canada or Australia) keeps the film’s money, contracts and liability apart from your personal finances. Investors buy into it, the rights belong to it, and incentives and union agreements are signed by it. For a tiny short you may not need one yet; for anything with investors, union cast or paid crew, you probably do.' },
      { h: 'Also', p: 'A separate bank account, an employer ID where needed (US EIN), bookkeeping from the start, and an accountant who knows film.' },
    ],
    sources: [SRC.sba, SRC.ukCompanies],
    topics: ['legal', 'funding'], keywords: 'llc limited company corporation ein bank account single purpose entity',
  },
  {
    ...base, id: 'legal-rights', group: 'Legal basics', title: 'Chain of title and copyright', lead: 'Proving you own the story you’re filming.',
    sections: [
      { p: 'Chain of title is the paper trail showing the production owns the rights to the script and anything it’s based on: the writer’s agreement or assignment, any option or purchase of a book, article or play, life-rights agreements for real people, and agreements with any co-writers. Without it you can’t get E&O insurance or sell the film.' },
      { h: 'Options', p: 'An option pays a small fee for the exclusive right to buy the rights later, for a set period. Agree the purchase price and terms in the option itself.' },
      { h: 'Copyright', p: 'Copyright exists when the work is written down, but registering it gives you more protection. In the US, the Copyright Office charges $45 to register one work by one author online and $65 for most other online filings (an increase has been proposed for 2026; check the current fees). In the UK and many other countries there is no registry: keep dated drafts.' },
      { h: 'Working together', p: 'If several people write or create the film, a collaboration agreement says who owns what. Crew and cast work for the production under work-for-hire or assignment clauses so the production owns what they create.' },
    ],
    sources: [SRC.copyright, SRC.copyrightCirc],
    use: [{ tab: 'paperwork', label: 'Paperwork' }],
    topics: ['legal'], keywords: 'chain of title copyright registration option purchase life rights adaptation work for hire assignment collaboration agreement',
  },
  {
    ...base, id: 'legal-releases', group: 'Legal basics', title: 'Releases, clearances and permits', lead: 'Permission for every face, place, logo and piece of art.',
    sections: [
      { p: 'Get a signed release from everyone recognisable on screen (talent and appearance releases), from every location owner (location releases), and for minors from a parent, plus any work permit the state requires. Clear artwork, logos, posters, signs, real names, phone numbers and addresses, or replace them. Open Gate’s Paperwork tab keeps these, and Scan script suggests what to check.' },
      { h: 'Permits', p: 'Filming on public property (streets, parks, roads) usually needs a permit from the city, county or national film office, often with proof of insurance and sometimes police or traffic control. Road closures (like the sample production’s truck swerve) take weeks to approve.' },
      { h: 'Fair use / fair dealing', p: 'Some uses of copyrighted material without permission are allowed (commentary, criticism, parody), but the rules differ by country and are decided case by case. E&O insurers often want a lawyer’s opinion letter. When in doubt, clear it or leave it out.' },
    ],
    use: [{ tab: 'paperwork', label: 'Paperwork → Clearances' }, { tab: 'locations', label: 'Locations' }],
    topics: ['legal'], keywords: 'release talent appearance location release minor work permit clearance logo artwork permit film office fair use fair dealing',
  },
  {
    ...base, id: 'legal-music', group: 'Legal basics', title: 'Music licensing', lead: 'Two licences for every recorded song, and a cue sheet.',
    sections: [
      { p: 'A recorded song has two copyrights: the composition (the writers and their publisher) and the recording (the artist’s label). To use it in a film you need a sync licence from the publisher and a master use licence from the label. Covering a song yourself still needs the sync licence. Fees depend on how the song is used (background or featured), for how long, in what media, territories and term.' },
      { h: 'Other routes', p: 'Hire a composer (with a work-for-hire or licence agreement), use production-music libraries, or licence from independent artists directly. Festival-only licences are cheaper but have to be upgraded if the film sells.' },
      { h: 'Cue sheets', p: 'A cue sheet lists every piece of music with timings, writers and publishers. Broadcasters and performing-rights organisations (ASCAP, BMI, PRS, SOCAN, APRA AMCOS) use it to pay royalties.' },
    ],
    use: [{ tab: 'licenses', label: 'Budget → Licenses' }],
    topics: ['legal', 'post'], keywords: 'music licence license sync master use cue sheet publisher label composer library pro ascap bmi prs socan apra festival license',
  },
  {
    ...base, id: 'legal-drones', group: 'Legal basics', title: 'Drones, minors, weapons and other special cases', lead: 'Rules that stop a shoot if you miss them.',
    sections: [
      { h: 'Drones', p: 'US: commercial drone flying needs an FAA Part 107 remote pilot certificate, and flying over people needs a waiver that can take months. UK: register with the CAA and get a flyer ID; commercial work may need operational authorisation, and many councils need permission. Canada (Transport Canada), Australia (CASA) and the EU (EASA) have their own licences and categories. Hire a licensed, insured operator.' },
      { h: 'Minors', p: 'Child performers usually need a work permit and have strict limits on hours, school time and a parent or guardian on set. Rules are set by the state, province or country.' },
      { h: 'Weapons, pyro and stunts', p: 'Prop and replica weapons need an armourer and often police notification; pyrotechnics need a licensed technician. Stunts need a stunt coordinator, and union agreements require one for stunt work. Declare all of it to your insurer.' },
    ],
    sources: [SRC.faa, SRC.caFilmDrones, SRC.caa, SRC.tc, SRC.casa, SRC.easa],
    topics: ['legal', 'production'], keywords: 'drone part 107 faa caa flyer id transport canada casa easa minor child performer permit armourer weapons pyro stunts',
  },
  {
    ...base, id: 'legal-lawyer', group: 'Legal basics', title: 'Working with an entertainment lawyer', lead: 'What to pay for first when money is tight.',
    sections: [
      { p: 'Worth paying for even on a small film: chain of title (especially if the story is based on anything or anyone real), investor agreements and the company, music and archive licences, and anything a distributor will send you. Many lawyers offer flat fees for standard documents; volunteer lawyers for the arts programmes help artists with low incomes.' },
      { h: 'Bring', p: 'The script, the budget, a list of everyone involved and what you’ve promised them, and your clearance report. The more organised you are, the shorter (and cheaper) the meeting.' },
    ],
    topics: ['legal'], keywords: 'entertainment lawyer attorney solicitor volunteer lawyers for the arts flat fee',
  },
];
