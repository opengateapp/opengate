import type { RefPage } from './topics';

// Budget & Funding: how film budgets work, ways to pay for a film, incentives by region,
// crowdfunding, marketing and festivals, and the money words. Written for Open Gate; figures that
// change (fees, rates, credits) carry sources and the date we checked them.

export const MONEY_CHECKED = '2026-10-23';
export const MONEY_NOTE = 'A plain-language summary, not financial, legal or tax advice. Fees and incentives change: confirm with the source, and talk to an accountant or entertainment lawyer before you rely on them.';

const SRC = {
  kickstarter: { label: 'Kickstarter: fees (United States)', url: 'https://www.kickstarter.com/help/fees' },
  ksBudget: { label: 'Kickstarter: how to create an expert Kickstarter budget', url: 'https://updates.kickstarter.com/how-to-create-an-expert-kickstarter-budget/' },
  indiegogo: { label: 'Indiegogo: platform fees (effective October 16, 2025)', url: 'https://support.indiegogo.com/hc/en-us/articles/41539705940628--NEW-Platform-Fees-Effective-October-16-2025' },
  seedFees: { label: 'Seed&Spark: what are your crowdfunding fees?', url: 'https://faq.seedandspark.com/en/articles/3055810-what-are-your-crowdfunding-fees' },
  seedGreen: { label: 'Seed&Spark: getting the “Green Light” (80%)', url: 'https://faq.seedandspark.com/en/articles/3065547-what-is-getting-the-green-light-and-what-does-it-mean' },
  seedRewards: { label: 'Seed&Spark: tips for crowdfunding incentives', url: 'https://seedandspark.com/blog/15-tips-for-creating-rewarding-crowdfunding-incentives' },
  gofundme: { label: 'GoFundMe: fees', url: 'https://www.gofundme.com/c/blog/gofundme-fees' },
  patreon: { label: 'Patreon: standard platform fee for new creators (after August 4, 2025)', url: 'https://support.patreon.com/hc/en-us/articles/36426991446797-A-standard-platform-fee-for-new-creators-effective-after-August-4-2025' },
  ulule: { label: 'Ulule: what is Ulule’s commission?', url: 'https://support.ulule.com/hc/en-us/articles/211812409-What-is-Ulule-s-commission' },
  backerkit: { label: 'BackerKit: pledge manager pricing', url: 'https://backerkit.com/pricing/pledge_manager' },
  regcf: { label: 'SEC: Regulation Crowdfunding', url: 'https://www.sec.gov/resources-small-businesses/exempt-offerings/regulation-crowdfunding' },
  fracturedAtlas: { label: 'Fiscal Sponsor Directory: Fractured Atlas', url: 'https://fiscalsponsordirectory.org/fractured-atlas/' },
  fiscalDir: { label: 'Fiscal Sponsor Directory', url: 'https://fiscalsponsordirectory.org/' },
  filmIndependent: { label: 'Film Independent: fiscal sponsorship', url: 'https://www.filmindependent.org/programs/fiscal-sponsorship/' },
  georgia: { label: 'Georgia Dept. of Economic Development: Georgia film tax credit', url: 'https://georgia.org/sites/default/files/2026-04/Understanding%20the%20Georgia%20Film%20Tax%20Credit%20%281%29.pdf' },
  california: { label: 'California Film Commission: Program 4.0 basics', url: 'https://film.ca.gov/tax-credit/the-basics-4-0' },
  montana: { label: 'Montana Department of Revenue: MEDIA tax credit', url: 'https://revenue.mt.gov/taxes/tax-credits/media-tax-credit' },
  ukIftc: { label: 'GOV.UK: UK Independent Film Tax Credit policy note', url: 'https://www.gov.uk/government/publications/uk-independent-film-tax-credit/hmt-hmrc-policy-note-uk-independent-film-tax-credit' },
  bfi: { label: 'BFI: UK film sector tax reliefs', url: 'https://www.bfi.org.uk/news/uk-film-sector-tax-reliefs' },
  cptc: { label: 'Canada.ca: Canadian Film or Video Production Tax Credit (CPTC)', url: 'https://www.canada.ca/en/canadian-heritage/services/funding/cavco-tax-credits/canadian-film-video-production.html' },
  pstc: { label: 'Canada.ca: Film or Video Production Services Tax Credit (PSTC)', url: 'https://www.canada.ca/en/revenue-agency/services/tax/international-non-residents/film-media-tax-credits/film-video-production-services-tax-credit-overview.html' },
  ausProducer: { label: 'Screen Australia: Producer Offset', url: 'https://www.screenaustralia.gov.au/producer-offset/' },
  ausIncentive: { label: 'Australian Government: Australian Screen Production Incentive', url: 'https://www.arts.gov.au/what-we-do/screen/australian-screen-production-incentive' },
  trip: { label: 'CNC: Tax Rebate for International Productions (TRIP)', url: 'https://www.cnc.fr/web/en/tax-rebate-for-international-productions' },
  ffa: { label: 'FFA: German federal film funding (DFFF / GMPF)', url: 'https://www.ffa.de/ffa-english' },
  ireland: { label: 'Saffery: Irish film and TV sector, Section 481 and the Scéal uplift', url: 'https://www.saffery.com/ie/insights/articles/irish-film-and-tv-sector-budget-2025-update-summary' },
  eurimages: { label: 'Council of Europe: Eurimages', url: 'https://www.coe.int/en/web/eurimages' },
  sag: { label: 'SAG-AFTRA: Ultra Low Budget Project rate sheet', url: 'https://www.sagaftra.org/production-center/contract/819/rate-sheet/document' },
  filmfreeway: { label: 'FilmFreeway: festival listings and fees', url: 'https://filmfreeway.com/festivals' },
  mariachi: { label: 'Sundance Institute: “El Mariachi” at 30 years', url: 'https://www.sundance.org/blogs/el-mariachi-at-30-years-looking-back-at-the-scrappy-passion-that-brought-the-film-to-life/' },
  mariachiWiki: { label: 'Wikipedia: El Mariachi', url: 'https://en.wikipedia.org/wiki/El_Mariachi' },
  blumhouse: { label: 'CNN Business (2022): the horror studio behind Halloween Ends is making a killing', url: 'https://abc17news.com/money/cnn-business-consumer/2022/10/14/its-a-scary-time-in-hollywood-but-the-horror-studio-behind-hits-like-halloween-ends-is-making-a-killing/' },
  blumhouseWiki: { label: 'Wikipedia: Blumhouse Productions', url: 'https://en.wikipedia.org/wiki/Blumhouse_Productions' },
};

const base = { checked: MONEY_CHECKED, notice: MONEY_NOTE, category: 'money' as const };

export const MONEY_PAGES: RefPage[] = [
  // ---------- Budgeting basics ----------
  {
    ...base, id: 'budget-how', group: 'Budgeting basics', title: 'How a film budget works', lead: 'A top sheet, accounts underneath, and every cost from the script to the festival.',
    sections: [
      { p: 'A film budget is a list of everything the film will cost, grouped into accounts (Cast, Camera, Locations, Post…) and rolled up onto a one-page top sheet. Each line is a quantity × a rate (5 days × $250), sometimes × a number of people, plus fringes on wages.' },
      { h: 'Where the numbers come from', p: 'The script is broken down into elements (cast, props, vehicles, stunts…), the breakdown becomes a schedule (how many days, where), and the schedule tells the budget how many days of each person, place and thing you pay for. That is why Open Gate links budget lines to the breakdown and the stripboard: change the schedule and the budget follows.' },
      { h: 'The phases', p: 'Development (rights, writing, packaging) → pre-production (prep, casting, scouting) → production (the shoot) → post-production (edit, sound, colour, music, VFX) → delivery (masters, captions, legal paperwork) → marketing and festivals. Beginners budget the shoot and forget the rest: post and marketing often cost as much as the shoot on a short.' },
      { h: 'Contingency', p: 'A safety margin on top, usually 10% of the subtotal. You will need it.' },
    ],
    table: { head: ['Section', 'Typical accounts', 'Often forgotten'], rows: [
      ['Above the line', 'Story & rights, producers, director, principal cast', 'Rights options, writer’s fees, cast pension & health'],
      ['Below the line: production', 'Crew, camera, grip & electric, art, wardrobe, locations, transport, catering', 'Permits, insurance, overtime, meals, parking, location fees'],
      ['Post', 'Editorial, sound, music, VFX, colour, deliverables', 'Music licences, captions, DCP'],
      ['Other', 'Marketing & festivals, legal & accounting, insurance', 'Key art, trailer, festival fees, travel, E&O'],
    ] },
    use: [{ tab: 'budget', label: 'Budget' }, { tab: 'breakdown', label: 'Script Breakdown' }, { tab: 'stripboard', label: 'Stripboard' }],
    topics: ['production', 'funding'], keywords: 'top sheet chart of accounts phases development prep post delivery',
  },
  {
    id: 'budget-terms', category: 'money', group: 'Budgeting basics', title: 'Above & below the line, fringes and payroll', lead: 'Who is ATL, what a fringe is, and employees vs contractors.',
    sections: [
      { p: 'Above-the-line (ATL) costs are the creative leads: writer, director, producers, principal cast. They are usually negotiated up front. Below-the-line (BTL) is everything that makes the film: crew, equipment, locations, post.' },
      { h: 'Fringes', p: 'Costs on top of wages: payroll taxes, workers’ compensation, union pension & health (SAG-AFTRA’s P&H on the Ultra Low Budget agreement is 22% as of September 2026), and payroll-service fees. Budget them as a percentage on each wage line.' },
      { h: 'Employee or contractor?', p: 'US: employees get a W-2 and payroll taxes are withheld; contractors get a 1099 and you report what you paid. Union performers are paid as employees, usually through an entertainment payroll company. UK: crew are often self-employed under HMRC’s lists; performers and some roles may need PAYE. Canada: T4 employees vs self-employed contractors; ACTRA and the guilds set their own rules. Whoever controls when, where and how someone works usually makes them an employee: ask an accountant.' },
      { h: 'Contingency', p: 'Usually 10% of the subtotal, kept for things that go wrong. Bond companies require it on bigger films.' },
    ],
    use: [{ tab: 'budget', label: 'Budget' }, { tab: 'paperwork', label: 'Paperwork' }],
    topics: ['production', 'funding'], keywords: 'atl btl fringe contingency top sheet payroll w-2 1099 paye t4 workers comp p&h pension health',
    sources: [SRC.sag], checked: MONEY_CHECKED, notice: MONEY_NOTE,
  },
  {
    ...base, id: 'budget-deals', group: 'Budgeting basics', title: 'Deals, rates and overtime', lead: 'Day, week and flat deals, kit fees, overtime, meal penalties, deferrals and points.',
    sections: [
      { p: 'A day rate pays per day worked (often for 10 or 12 hours). A weekly rate is usually 4–5 day rates for 5 days. A flat deal pays one amount for the job however long it takes. A kit fee pays someone for using their own gear (a sound kit, a makeup kit).' },
      { h: 'Overtime and meals', p: 'Past the agreed hours, overtime is usually 1.5×, then 2×. A meal break is due within about 6 hours of call; late meals cost meal penalties under union agreements. Turnaround is the rest between wrap and the next call (often 10–12 hours). A late wrap on a night shoot can push the next day.' },
      { h: 'Deferrals and points', p: 'Deferred pay is promised later, usually only if the film earns money: often it never is, so be honest. Points are a share of profits (backend), after the investors recoup. Neither is a substitute for paying people fairly on set when you can.' },
    ],
    use: [{ tab: 'paperwork', label: 'Paperwork → deal memos' }, { tab: 'budget', label: 'Budget' }],
    topics: ['production', 'funding'], keywords: 'day rate weekly flat kit fee overtime turnaround meal penalty deferral points backend',
  },
  {
    ...base, id: 'budget-tracking', group: 'Budgeting basics', title: 'Tracking spend: actuals and cost reports', lead: 'Estimate vs actual, EFC, ETC and cash flow.',
    sections: [
      { p: 'Once money moves, keep receipts against budget lines. Actuals are what you’ve spent; committed is what you’ve agreed to spend; estimate to complete (ETC) is what’s still to come. Estimated final cost (EFC) = actuals + committed + ETC. Compare EFC with the locked budget every week of the shoot.' },
      { h: 'Cash flow', p: 'The budget says how much; cash flow says when. Deposits, rentals and payroll land before the shoot; tax credits and some grants arrive months after. Plan when each payment goes out and when each source of money arrives.' },
    ],
    use: [{ tab: 'expenses', label: 'Expenses' }, { tab: 'budget', label: 'Budget → Cost report' }],
    topics: ['production', 'funding'], keywords: 'actuals cost report efc etc estimate to complete committed burn rate cash flow',
  },
  {
    ...base, id: 'budget-sizes', group: 'Budgeting basics', title: 'What films cost: shorts to features', lead: 'Rules of thumb, and where the money goes.',
    sections: [
      { p: 'There is no standard price for a short. A few pages with friends, owned gear and one location can cost a few hundred dollars. Union performers, paid crew, permits, insurance and stunts push a 10-page short into five figures: the Open Gate sample production (11 pages, 3 shoot days plus a pickup, two stunts, SAG-AFTRA Ultra Low rates) comes to about $18,000.' },
      { h: 'What drives cost', p: 'Shoot days (each one pays everyone again), locations and company moves, night shoots, cast size, stunts, animals, vehicles, VFX, period wardrobe and licensed music. Cut a day and you save more than cutting a prop.' },
      { h: 'Rough splits on a lean short', p: 'Production (people, places, gear, food) often takes 50–65%; post 15–25%; marketing and festivals 5–15%; insurance, legal and contingency the rest. Start with your own numbers: these only tell you when something looks off.' },
    ],
    use: [{ tab: 'funding', label: 'Budget → Funding' }],
    topics: ['production', 'funding'], keywords: 'how much does a short film cost budget size rule of thumb',
  },
  {
    ...base, id: 'writing-to-budget', group: 'Budgeting basics', title: 'Writing to a budget', lead: 'Write the film you can afford: what costs money on the page, and what doesn’t.',
    sections: [
      { p: 'Every line of a script turns into money: “EXT. HIGHWAY – NIGHT – a car chase in the rain” is a picture car, a stunt driver, a closed road, lights and a rain machine, all paid by the day. “INT. KITCHEN – DAY – two people argue” is two actors and a room you already have. Neither is better writing; one is a lot cheaper.' },
      { h: 'What costs money', p: 'Shoot days (everyone is paid again each day), locations and moving between them, speaking roles, night scenes (lights, slower days, later hours), crowds and extras, vehicles, weather, children (shorter hours, a guardian, permits), animals (a trainer), stunts and fights (a coordinator and insurance), period wardrobe and sets, and visual effects.' },
      { h: 'What’s cheap', p: 'One or two locations you can use for free, day interiors, a small cast, people talking under pressure, things you already own, and time running in real time. Limits push a story inward, toward characters: plenty of good films are two people in a room.' },
      { h: 'Write around what you have', p: 'Make a list before you write: places, people, props, skills, a car, a dog. Then write a story that needs those things. Robert Rodriguez made El Mariachi (1992) for about $7,000, around half of it earned as a paid volunteer in clinical drug trials, and built it around the people and places he had access to in Ciudad Acuña. Columbia Pictures later spent far more than that on post-production before releasing it, so the famous number is the shoot, not the finished film.' },
      { h: 'The Blumhouse model', p: 'Blumhouse makes films for small, fixed budgets and gives directors creative freedom in exchange for lower pay up front and a share of the profits. Paranormal Activity (2007) was made for about $15,000; Get Out cost about $4.5 million and earned around $255 million. Small budgets mean contained stories: one house, a few characters, the scares built from sound, darkness and performance rather than effects.' },
      { h: 'In Open Gate', p: 'Home → Start from a budget turns your money and what you have into limits: about how many shoot days, locations, speaking roles and pages it pays for. While you write, Write → Limits counts them, flags the things that cost money, and says when a scene takes you past a limit (“Scene 14 adds a 4th location”). The numbers are rough rules of thumb: change any of them, and once the script is done, Budget → Update from breakdown builds the real budget.' },
    ],
    use: [{ tab: 'screenplay', label: 'Write → Limits' }, { tab: 'budget', label: 'Budget' }],
    topics: ['production', 'funding'], keywords: 'write to budget low budget contained story locations el mariachi rodriguez blumhouse paranormal activity micro budget screenplay limits',
    sources: [SRC.mariachi, SRC.mariachiWiki, SRC.blumhouse, SRC.blumhouseWiki],
  },

  // ---------- Funding ----------
  {
    ...base, id: 'funding-ways', group: 'Funding', title: 'Ways to fund a film', lead: 'Your own money, people who believe in you, institutions and the market.',
    sections: [
      { p: 'Most independent films stack several sources. Work out how much you need first (Budget → Funding walks you through it), then match each part of the budget to a source, and to when that money actually arrives.' },
    ],
    table: { head: ['Source', 'Good for', 'Watch out for'], rows: [
      ['Your own savings', 'Shorts, proofs of concept', 'Never spend what you can’t lose'],
      ['Friends & family', 'Small gaps', 'Put it in writing: gift, loan or investment?'],
      ['In-kind', 'Gear, locations, food, services', 'Still record its value; credit the givers'],
      ['Crowdfunding (rewards)', 'Shorts and community-driven films', 'Fees and rewards eat 15–30%; it’s a full-time campaign'],
      ['Grants', 'Docs, arts, under-represented voices', 'Deadlines months ahead; often need a fiscal sponsor'],
      ['Private investors (equity)', 'Features with a sales plan', 'Securities law; recoupment and a waterfall'],
      ['Pre-sales and MGs', 'Features with known cast or genre', 'Needs a sales agent; rarely for shorts'],
      ['Tax incentives', 'Spend in a region with a programme', 'Arrive after the shoot; minimum spends; audits'],
      ['Sponsorship & product placement', 'Brands that fit the story', 'Clearances and creative control'],
      ['Loans / gap financing', 'Bridging money you’re owed', 'Interest, collateral, personal guarantees'],
    ] },
    use: [{ tab: 'funding', label: 'Budget → Funding' }],
    topics: ['funding'], keywords: 'financing funding sources equity grants in-kind presales gap loans soft money',
  },
  {
    ...base, id: 'crowdfunding', group: 'Funding', title: 'Crowdfunding', lead: 'Platforms, fees, the 30% rule, and campaigns that actually fund.',
    sections: [
      { p: 'Rewards crowdfunding: backers pledge money and get perks (a thank-you, a download, a poster, a credit, a set visit), not a share of the film. Most platforms are all-or-nothing: miss the goal and nobody is charged.' },
      { h: 'The campaign', p: 'A short pitch video (you, the story, why now), a clear goal and what it pays for, 5–7 reward tiers (common levels: $15, $25, $50, $100, $250, $500, $1,000), and 30–45 days of daily outreach. Campaigns that fund usually arrive at launch with about 30% already promised by their own network: strangers back campaigns that look like they’ll succeed.' },
      { h: 'Investment crowdfunding is different', p: 'Selling a share of the film to the public (US Regulation Crowdfunding, through registered portals such as Wefunder or Republic; UK platforms such as Crowdcube) is a securities offering, with disclosures, filings and limits. In the US, Reg CF caps a company at $5 million in 12 months and limits what non-accredited investors can put in. Talk to a lawyer first.' },
      { h: 'Taxes', p: 'In the US, rewards-based pledges are generally taxable income in the year you receive them, and rewards may count as sales for sales-tax purposes. In the UK and EU, VAT can apply to rewards. Set some aside and ask an accountant.' },
    ],
    table: { head: ['Platform', 'Fee', 'Payment processing', 'Model', 'Notes'], rows: [
      ['Kickstarter', '5%', '3% + $0.30 per pledge (5% + $0.08 under $10)', 'All-or-nothing', 'Film is a big category; strict project rules'],
      ['Indiegogo', '5%', '3% + $0.20 per transaction', 'Fixed (all-or-nothing) for new campaigns', 'Flexible funding ended for campaigns from Oct 16, 2025 (Gamefound)'],
      ['Seed&Spark', '0% platform fee', 'About 2.9% + $0.30 (Stripe)', 'Funds if you reach 80% (“Green Light”)', 'Built for film; creator perks and distribution ties'],
      ['GoFundMe', '0% for organizers', '2.9% + $0.30 (US)', 'Keep what you raise', 'Optional donor tips; donations, not rewards'],
      ['Patreon', '10% (new pages since Aug 4, 2025)', '2.9% + $0.30 (cards)', 'Monthly memberships', 'For ongoing work (a series, a channel), not one film'],
      ['Ulule (EU)', '8% incl. VAT (cards)', 'Included', 'All-or-nothing', 'Strong in France and Europe'],
      ['Wefunder / Republic (US), Crowdcube (UK)', 'Typically 5–8% of what’s raised + costs', 'Varies', 'Investment, not rewards', 'Securities rules apply; check each fee schedule'],
    ] },
    use: [{ tab: 'funding', label: 'Budget → Funding (crowdfunding goal)' }],
    sources: [SRC.kickstarter, SRC.indiegogo, SRC.seedFees, SRC.seedGreen, SRC.gofundme, SRC.patreon, SRC.ulule, SRC.regcf],
    topics: ['funding', 'marketing'], keywords: 'kickstarter indiegogo seed and spark seed&spark gofundme patreon ulule wefunder republic crowdcube reg cf all or nothing pledge backers campaign 30% rule',
  },
  {
    ...base, id: 'crowdfunding-rewards', group: 'Funding', title: 'Perks, rewards and fulfilment', lead: 'What rewards really cost, and how to set a goal that still pays for the film.',
    sections: [
      { p: 'Every reward you promise is a cost that comes out of the money you raise, and platform and processing fees are charged on the whole pledge, shipping included. Raise $10,000 with a lot of physical rewards and you can easily have $7,000 left for the film.' },
      { h: 'Cheap to deliver, still valued', p: 'Thank-you posts and emails, a digital download or private stream link, the digital script, a credit (“Special thanks”), a video call with the director, a production diary, festival screening invites, a name on a prop or in a scene, a set visit or a walk-on (check insurance and the shoot schedule first).' },
      { h: 'Costly: price these carefully', p: 'Posters, T-shirts, Blu-rays, props, signed items, anything that ships. Seed&Spark’s example: an 11×17 poster costs about $9–11 to print, $5.99 for a tube and $4–9 to post, so a $25 poster tier can cost $20 to fulfil. Many filmmakers avoid physical goods below $100.' },
      { h: 'The hidden costs', p: 'Packaging, international postage (rates rise every 6–12 months), lost parcels, a pledge manager if you need one (BackerKit: about 2% of what you raised plus 3.5% on extra charges, for campaigns run elsewhere), taxes on rewards, and your own time. Kickstarter’s advice: price shipping by weight and destination and build it into the goal from the start.' },
      { h: 'Setting the goal', p: 'Goal = (money the film needs + reward costs + fixed fees) ÷ (1 − platform % − processing % − pledge manager % − tax reserve %). Budget → Funding works this out from your reward tiers and the platform you pick.' },
    ],
    use: [{ tab: 'funding', label: 'Budget → Funding (rewards and goal)' }],
    sources: [SRC.ksBudget, SRC.seedRewards, SRC.backerkit, SRC.kickstarter],
    topics: ['funding', 'marketing'], keywords: 'perks rewards tiers fulfilment fulfillment shipping postage merch poster t-shirt pledge manager backerkit backer survey',
  },
  {
    ...base, id: 'grants-fiscal', group: 'Funding', title: 'Grants and fiscal sponsorship', lead: 'Free money, with deadlines, reports and often a nonprofit partner.',
    sections: [
      { p: 'Grants come from arts councils, film funds, foundations and festivals. They don’t want a share of the film, but they want a strong application, a realistic budget, and reports on how you spent the money. Deadlines are often months before the money arrives.' },
      { h: 'Fiscal sponsorship (US)', p: 'Many foundations only give to nonprofits, and donations are only tax-deductible to a nonprofit. A fiscal sponsor is a 501(c)(3) that takes donations on your project’s behalf and passes them on, for a fee: Fractured Atlas charges 8% (plus membership); others charge roughly 5–8%. Film-focused sponsors include Film Independent, the International Documentary Association, From the Heart Productions and Women Make Movies.' },
      { h: 'Elsewhere', p: 'UK: the BFI and the national screen agencies (Creative Scotland, Ffilm Cymru Wales, Northern Ireland Screen) fund development and production; arts charities can act like fiscal sponsors. Canada: Telefilm, the Canada Council for the Arts, the Bell Fund and provincial agencies (Ontario Creates, Creative BC, SODEC). Australia: Screen Australia and the state agencies (Screen NSW, VicScreen, Screen Queensland…). EU: national film institutes and Creative Europe MEDIA.' },
    ],
    sources: [SRC.fracturedAtlas, SRC.fiscalDir, SRC.filmIndependent],
    use: [{ tab: 'funding', label: 'Budget → Funding' }],
    topics: ['funding'], keywords: 'grant fiscal sponsor 501c3 fractured atlas film independent ida from the heart women make movies bfi telefilm screen australia creative europe',
  },
  {
    ...base, id: 'investors', group: 'Funding', title: 'Investors, recoupment and the waterfall', lead: 'Equity, points, and why securities law matters.',
    sections: [
      { p: 'An equity investor puts money in for a share of what the film earns. Usually the film is made by its own company (an LLC in the US) and investors buy membership units. Money that comes back goes down a waterfall: sales and distribution fees first, then debts, then investors get their money back (recoupment), often with a premium (e.g. 120%), then profits split between investors and the producers’ side, which pays out points to cast and crew.' },
      { h: 'Securities law', p: 'Selling a share of a film is selling a security. In the US that means an exemption such as Regulation D (mostly accredited investors) or Regulation Crowdfunding, with paperwork and limits; the UK, Canada, Australia and the EU have their own rules. A lawyer is not optional here.' },
      { h: 'Pre-sales, MGs and gap', p: 'A pre-sale is a distributor in one territory paying a minimum guarantee (MG) before the film is made, usually because of cast or genre. Banks lend against pre-sales and tax credits; gap financing lends against unsold territories at a higher cost. These are feature-film tools; shorts rarely sell this way.' },
    ],
    sources: [SRC.regcf],
    topics: ['funding'], keywords: 'equity investor recoupment waterfall points backend premium llc reg d accredited pre-sale presale minimum guarantee mg gap financing bank loan',
  },
  {
    ...base, id: 'in-kind', group: 'Funding', title: 'In-kind support, sponsors and product placement', lead: 'Things instead of money, and brands that pay to be in the film.',
    sections: [
      { p: 'In-kind support is anything given instead of cash: a location, gear, food, a vehicle, a service. Record what it would have cost (it still belongs in the budget and helps grant applications), get it in writing, and credit people.' },
      { h: 'Sponsors and placement', p: 'A brand may pay or give product to appear. Agree how it appears, what you won’t change, and clear it like any other logo (Paperwork → Clearances). Don’t let a sponsor become a hidden investor.' },
    ],
    use: [{ tab: 'funding', label: 'Budget → Funding' }, { tab: 'paperwork', label: 'Paperwork → Clearances' }],
    topics: ['funding'], keywords: 'in-kind donated sponsor product placement brand barter',
  },

  // ---------- Incentives by region ----------
  {
    ...base, id: 'incentives', group: 'Tax incentives', title: 'How film incentives work', lead: 'Money back for spending in a place, after the fact.',
    sections: [
      { p: 'Many countries, states and provinces return a percentage of what a production spends there, as a tax credit, rebate or grant. You spend first, apply and get audited, then receive the money (or sell a transferable credit to a local taxpayer at a discount). Most have a minimum spend, a cultural or residency test, caps and paperwork; many are aimed at features and series rather than shorts.' },
      { h: 'Types', p: 'Refundable: paid out even if you owe no tax. Transferable: you can sell it. Non-refundable: only reduces tax you owe. Rebate or cash grant: paid directly. Banks will lend against a certified credit, at a cost.' },
      { h: 'For your budget', p: 'An incentive doesn’t reduce what you must raise before the shoot: it pays you back later. Budget → Funding lists incentives as arriving after the shoot for that reason.' },
    ],
    use: [{ tab: 'funding', label: 'Budget → Funding' }],
    topics: ['funding'], keywords: 'tax credit rebate incentive refundable transferable soft money',
  },
  {
    ...base, id: 'incentives-us', group: 'Tax incentives', title: 'United States', lead: 'State by state: credits, minimums and caps.',
    sections: [
      { p: 'There is no federal film incentive for production spend; the states run their own. Rates, caps, minimum spends and whether credits are refundable or transferable vary widely, and programmes open, close and run out of money. Check the state film office before you plan around one.' },
    ],
    table: { head: ['State', 'Headline', 'Notes'], rows: [
      ['Georgia', '20% + 10% uplift', 'Transferable credit; $500,000 minimum spend in a tax year; uplift needs the Georgia logo/promo and distribution; audit required'],
      ['California (Program 4.0)', '35% base', '$750M a year from July 2025 to 2030; independent films: 35% on the first $20M, credits can be sold'],
      ['Montana (MEDIA Act)', 'Extended to 2045, $12M a year', 'The Department of Revenue says no credit is currently available for productions filming after 2024; most future money reserved for Montana residents'],
      ['Others', 'Many states', 'New Mexico, New York, New Jersey, Louisiana, Illinois, Texas and more: check each state film office'],
    ] },
    sources: [SRC.georgia, SRC.california, SRC.montana],
    topics: ['funding'], keywords: 'georgia california new mexico new york montana media act state film office tax credit usa',
  },
  {
    ...base, id: 'incentives-uk', group: 'Tax incentives', title: 'United Kingdom', lead: 'AVEC and the Independent Film Tax Credit.',
    sections: [
      { p: 'The Audio-Visual Expenditure Credit (AVEC) pays 34% on qualifying UK spend for films (up to 80% of core expenditure). The UK Independent Film Tax Credit (IFTC) raises that to 53% for films with budgets up to £15 million (tapering up to £23.5 million), for spend from April 2024, with claims from April 2025. Films must pass the BFI cultural test, and the IFTC needs a UK writer or director, or official co-production status.' },
    ],
    sources: [SRC.ukIftc, SRC.bfi],
    topics: ['funding'], keywords: 'uk avec iftc independent film tax credit bfi cultural test hmrc',
  },
  {
    ...base, id: 'incentives-ca', group: 'Tax incentives', title: 'Canada', lead: 'Federal CPTC or PSTC, plus a provincial credit.',
    sections: [
      { p: 'Federal: the Canadian Film or Video Production Tax Credit (CPTC) refunds 25% of qualified labour expenditure for Canadian-content productions by Canadian companies (labour capped at 60% of production cost, so about 15% of cost at most). The Production Services Tax Credit (PSTC) refunds 16% of qualified Canadian labour for any accredited production. You claim one or the other, after certification by CAVCO. Every province adds its own credit (Ontario, BC, Quebec and others), often stackable with the federal one.' },
    ],
    sources: [SRC.cptc, SRC.pstc],
    topics: ['funding'], keywords: 'canada cptc pstc cavco telefilm provincial tax credit ontario bc quebec',
  },
  {
    ...base, id: 'incentives-au', group: 'Tax incentives', title: 'Australia', lead: 'Producer, Location and PDV Offsets.',
    sections: [
      { p: 'The Producer Offset (run by Screen Australia) is a refundable tax offset of 40% of qualifying Australian production expenditure for feature films made for cinema, and 30% for other eligible projects. The Location Offset (30% for projects starting from July 2023, with more than A$20M spent in Australia) and the PDV Offset (30% for post, digital and VFX work, at least A$500,000) target bigger productions. You can only receive one of the three. States add their own grants.' },
    ],
    sources: [SRC.ausProducer, SRC.ausIncentive],
    topics: ['funding'], keywords: 'australia producer offset location offset pdv screen australia',
  },
  {
    ...base, id: 'incentives-eu', group: 'Tax incentives', title: 'European Union & Ireland', lead: 'National schemes, plus co-production funds.',
    sections: [
      { p: 'Each country runs its own programmes. A few examples: France’s TRIP rebate pays 30% (40% with more than €2M of French VFX) to international productions through a French service company, alongside a separate domestic credit. Germany’s DFFF and GMPF pay 30% of German production costs (2026 funds were reported exhausted by August; check the FFA). Ireland’s Section 481 gives up to 32%, with the Scéal uplift to 40% for Irish feature films with qualifying spend up to €20M.' },
      { h: 'Co-productions', p: 'Official co-productions between countries can access each partner’s funds. Eurimages (Council of Europe) supports co-productions between member states.' },
    ],
    sources: [SRC.trip, SRC.ffa, SRC.ireland, SRC.eurimages],
    topics: ['funding'], keywords: 'europe eu france trip cnc germany dfff gmpf ffa ireland section 481 sceal eurimages co-production',
  },

  // ---------- Marketing & distribution ----------
  {
    ...base, id: 'marketing', group: 'Marketing & distribution', title: 'Marketing your film', lead: 'Budget for it from day one: some of it has to happen on set.',
    sections: [
      { p: 'Marketing starts before the shoot. Things you can only get during production: unit stills (proper photos of scenes and cast, not phone snaps), behind-the-scenes video for an EPK (electronic press kit), and interviews with cast. Missing these is expensive or impossible to fix later.' },
      { h: 'What to budget', p: 'Unit stills photographer (a day or two), BTS/EPK, key art (the poster), a trailer, a website or landing page and social accounts, a press kit, paid social ads (optional), screenings, and a publicist for a big premiere (optional and pricey). Open Gate puts these in the Festivals & Marketing account (5100): Budget → Add marketing & festival lines.' },
      { h: 'Your audience', p: 'Who is this for, and where are they online? Build that audience while you make the film: the same people back your crowdfunding, come to screenings and share the trailer.' },
    ],
    use: [{ tab: 'budget', label: 'Budget → Add marketing & festival lines' }, { tab: 'tasks', label: 'Tasks → marketing checklist' }],
    topics: ['marketing'], keywords: 'marketing key art poster trailer epk press kit unit stills bts social media publicist audience',
  },
  {
    ...base, id: 'festivals', group: 'Marketing & distribution', title: 'Festival strategy and costs', lead: 'Premieres, fees, waivers and DCPs.',
    sections: [
      { p: 'Plan the festival run before you submit. Top festivals want premieres (world, international, national), so where you screen first matters. Make a list in tiers, note deadlines (early deadlines are cheaper), and budget the fees.' },
      { h: 'Costs', p: 'Submission fees are often about $20–80 per festival for shorts (cheaper at early deadlines; some offer waivers). Most submissions go through FilmFreeway. Selected films may need a DCP (a digital cinema package; for a short, roughly $50–150 through some festival partners), subtitles or captions, publicity stills, and travel to attend.' },
      { h: 'In Open Gate', p: 'Release → Festivals keeps your list: tier, premiere rule, every deadline, where each submission stands and the laurels you win; fees and travel are kept with the budget, so a marketing person can work the list without seeing money. Planned fees and travel go straight into the budget, deadlines show on the Calendar, and it warns when a festival that wants a premiere comes after one you’ve already planned. Tasks → Add marketing & festival checklist puts the rest on a timeline from picture lock.' },
      { h: 'Why you paste instead of import', p: 'FilmFreeway’s terms don’t allow automated reading of its site, and its API is only for festivals. So you copy the dates and fees from a festival’s page and paste them into Release → Festivals; Open Gate reads them on your device and you check them before saving. You still submit on FilmFreeway.' },
    ],
    use: [{ tab: 'festivals', label: 'Release → Festivals' }, { tab: 'tasks', label: 'Tasks → marketing & festival checklist' }, { tab: 'budget', label: 'Budget' }],
    sources: [SRC.filmfreeway, { label: 'FilmFreeway: Terms of Service (no scraping or automated extraction)', url: 'https://filmfreeway.com/page/terms-of-service' }], topics: ['marketing'], keywords: 'festival list tracker deadlines submissions filmfreeway premiere status world premiere dcp waiver screening tiers',
  },
  {
    ...base, id: 'distribution', group: 'Marketing & distribution', title: 'Distribution paths and deliverables', lead: 'Self-distribution, aggregators, sales agents, and what they’ll ask you for.',
    sections: [
      { p: 'Shorts usually live at festivals and then online (Vimeo, YouTube, curated channels). Features may go through a sales agent (who sells territories to distributors), a distributor directly, an aggregator (who places the film on platforms for a fee), or self-distribution. P&A (prints and advertising) is what it costs to release a film in cinemas.' },
      { h: 'Deliverables', p: 'What a buyer needs: picture and sound masters, a stereo and 5.1 mix, M&E (music and effects without dialogue) for dubbing, captions and subtitles, a music cue sheet, key art, stills, a trailer, chain-of-title documents, clearance reports and releases, and often E&O insurance. Keeping paperwork in Open Gate from day one makes this list much shorter.' },
    ],
    use: [{ tab: 'paperwork', label: 'Paperwork → Clearances' }, { tab: 'licenses', label: 'Licenses' }],
    topics: ['marketing', 'post'], keywords: 'distribution sales agent aggregator self-distribution p&a deliverables m&e cue sheet masters captions',
  },
];

// ---------- Money words ----------
const GLOSSARY: [string, string][] = [
  ['Above the line (ATL)', 'Writer, director, producers, principal cast: the creative leads.'],
  ['Below the line (BTL)', 'Crew, equipment, locations, post: everything that makes the film.'],
  ['Actuals', 'What has really been spent, from receipts and invoices.'],
  ['Aggregator', 'A company that places your film on streaming platforms for a fee.'],
  ['All-or-nothing', 'Crowdfunding where backers are only charged if the goal is reached.'],
  ['Allowance', 'A lump sum for a category you can’t itemise yet.'],
  ['Backend', 'A share of profits paid after recoupment.'],
  ['Backer', 'Someone who pledges to a crowdfunding campaign.'],
  ['Bond (completion bond)', 'A guarantee to financiers that the film will be finished on budget.'],
  ['Burn rate', 'How fast money is being spent, per day or week.'],
  ['Cash flow', 'When money goes out and comes in, not just how much.'],
  ['Chain of title', 'The documents proving you own the rights to the story and script.'],
  ['Committed', 'Money agreed but not yet paid (a booked rental, a signed deal).'],
  ['Completion bond', 'See Bond.'],
  ['Contingency', 'A safety margin, usually 10% of the subtotal.'],
  ['Cost report', 'Budget vs actuals vs estimate to complete, updated during the shoot.'],
  ['Day rate', 'Pay for one working day.'],
  ['Deal memo', 'A short agreement of someone’s pay and terms.'],
  ['Deferral', 'Pay promised later, usually only if the film earns money.'],
  ['Deliverables', 'The masters and paperwork a distributor needs.'],
  ['DCP', 'Digital Cinema Package: the file format cinemas and festivals project.'],
  ['E&O insurance', 'Errors & omissions: covers claims over rights, names, music and likeness.'],
  ['EFC', 'Estimated final cost: actuals + committed + estimate to complete.'],
  ['EPK', 'Electronic press kit: BTS video, interviews, stills for press.'],
  ['Equity', 'Ownership in the film’s company, bought by investors.'],
  ['ETC', 'Estimate to complete: what is still to be spent.'],
  ['Fiscal sponsor', 'A nonprofit that receives grants and donations for your project.'],
  ['Flat deal', 'One fee for the whole job.'],
  ['Fringe', 'Payroll costs on top of wages: taxes, P&H, workers’ comp.'],
  ['Fulfilment', 'Making and delivering crowdfunding rewards.'],
  ['Gap financing', 'A loan against territories not yet sold.'],
  ['Green light', 'Approval to make the film; on Seed&Spark, reaching 80% of your goal.'],
  ['In-kind', 'Goods or services given instead of money.'],
  ['Key art', 'The film’s poster image and title treatment.'],
  ['Kit fee', 'Payment for using someone’s own equipment.'],
  ['Line producer', 'The producer who builds and runs the budget and schedule.'],
  ['Loan-out', 'A person’s own company that “lends” them to the production.'],
  ['M&E', 'Music and effects track without dialogue, for dubbing.'],
  ['Meal penalty', 'A charge when a meal break comes too late.'],
  ['MG (minimum guarantee)', 'An advance a distributor pays for rights to a territory.'],
  ['Net profits', 'What’s left after every cost and fee, if anything.'],
  ['Overages', 'Spending over budget.'],
  ['P&A', 'Prints and advertising: the cost of releasing a film.'],
  ['P&H', 'Pension and health contributions paid to a union.'],
  ['Payroll company', 'A service that pays employees and handles taxes and union reports.'],
  ['Pick-up', 'Extra shooting after the main shoot; also a distributor buying a finished film.'],
  ['Pledge manager', 'A tool to collect addresses, add-ons and shipping after a campaign.'],
  ['Points', 'Percentage shares of profit.'],
  ['Pre-sale', 'Selling distribution rights before the film is made.'],
  ['Producer’s share', 'The producers’ half of profits, from which points are paid.'],
  ['Product placement', 'A brand paying or giving product to appear on screen.'],
  ['Recoupment', 'Investors getting their money back before profits are split.'],
  ['Refundable credit', 'A tax credit paid out even if no tax is owed.'],
  ['Reg CF / Reg D', 'US securities exemptions for selling shares to the public / to accredited investors.'],
  ['Residuals', 'Payments to union members when a film is reused or sold further.'],
  ['Rewards crowdfunding', 'Backers get perks, not a share of the film.'],
  ['Sales agent', 'Sells a film’s rights to distributors around the world.'],
  ['Soft money', 'Incentives, grants and rebates that don’t need paying back.'],
  ['Stretch goal', 'An extra target after a campaign funds, with extra rewards.'],
  ['Subtotal', 'The budget before contingency.'],
  ['Top sheet', 'The one-page summary of a budget by account.'],
  ['Transferable credit', 'A tax credit you can sell to someone else.'],
  ['Turnaround', 'Rest time between wrap and the next call.'],
  ['Waterfall', 'The order in which a film’s income is paid out.'],
  ['Workers’ comp', 'Insurance for injuries at work, required for employees.'],
];

MONEY_PAGES.push({
  ...base, id: 'money-words', group: 'Money words', title: 'Money words: a glossary', lead: 'Budget, funding and distribution terms in one place.',
  sections: [{ p: 'Search Reference for any of these. Most are explained in more depth on the other Budget & Funding pages.' }],
  table: { head: ['Term', 'Means'], rows: GLOSSARY.map(([t, m]) => [t, m]) },
  topics: ['funding'], keywords: GLOSSARY.map(([t]) => t).join(' '),
  checked: undefined, notice: undefined,
});
