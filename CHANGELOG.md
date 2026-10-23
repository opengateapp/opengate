# Changelog

## v0.4.0 — 2026-10-23

Paperwork and unions, funding and festivals, a filled-in sample production, and a storyboard toolbar made for artists.

- **Paperwork** (Plan → Paperwork), private like the budget:
  - deal memos whose rates feed the budget;
  - releases you can **sign on a phone or iPad**;
  - start forms (recording only that they were received, never SSNs or bank details);
  - a **clearances log** with **Scan script** (phone numbers, addresses, websites, brands, names, tagged props, and now every location);
  - **time cards** with overtime and meal penalties, and payroll CSVs.
- **Unions:** union, status and local for every cast, crew and contact row; the production's agreement (SAG-AFTRA tiers checked October 2026); Taft-Hartley warnings; union fringes; and a call-sheet warning when someone hasn't signed.
- **Reference:**
  - **Guilds & Unions:** researched pages for every major union and honorary society, with sources;
  - **Budget & Funding:** how budgets work, fringes and payroll, crowdfunding (Kickstarter, Indiegogo, Seed&Spark and more), perks and fulfilment, grants and fiscal sponsorship, investors, and tax incentives for the US, UK, Canada, Australia and the EU, plus marketing, festivals, distribution and a money glossary;
  - **Legal & Insurance:** production insurance, E&O, chain of title, releases, music licensing, drones and minors.
  - Every page states when it was checked.
- **Budget → Funding: "How much do I need to raise?"**
  - From your breakdown to a goal: shoot days estimated from page count before you schedule (so the budget isn't $0);
  - a quick estimate with starter rates (it never overwrites your numbers);
  - a checklist of what people forget;
  - your funding sources;
  - what's left to raise before and after the shoot;
  - a **crowdfunding goal that pays for its own fees, perks and postage**.
- **Budget → Festivals:**
  - your festival list with every deadline, fee, festival date, tier, premiere rule and status;
  - **paste a festival's dates and fees** from FilmFreeway or its website (Open Gate reads them on your device; it never scrapes);
  - fees and travel go into the budget, and deadlines show on the Calendar.
- **Marketing:**
  - a Festivals & Marketing block for budgets: stills, EPK, key art, trailer, web, ads, press kit, festival fees, DCP, travel and publicist;
  - a **marketing & festival checklist** in Tasks, timed from your shoot and picture lock.
- **Sample production:**
  - Home now offers **Sample script** or **Sample production**;
  - the production is an original 11-page "The Last Reel" filled in across every section, with **two stunts and their stunt performers**, code-drawn storyboards, a budget at real Ultra Low rates, funding and festivals;
  - a few deliberate problems (Taft-Hartley, an unsigned release, a meal penalty, an uncleared song) show what the warnings are for.
- **Storyboards:**
  - **framing formats** (vertical 9:16 to scope 2.39 and IMAX) and colour-coded frame guides;
  - a **grid** on the toolbar (rule of thirds or N × M, centre mark, safe areas);
  - a simpler toolbar with one colour palette and size previews;
  - **"+ Frame" inside the editor** with onion skin for drawing motion;
  - PDFs that keep the frame's shape.
- **Layout:**
  - sections follow the production pipeline (Shot Lists in Breakdown; Contacts, Locations, Paperwork, Calendar and Tasks in Plan);
  - Reports are now the ⤓ Exports button;
  - the Reference hover menu shows categories and jumps to the page in the sidebar.
- **Contacts:**
  - crew roles are a department dropdown;
  - locations show their clearance status and link to their release;
  - honorary societies add their letters after names in the end credits.
- **Fixes:** menus, dialogs and labels wrap instead of running off; many phone and iPad layout fixes.

## v0.3.0 — 2026-10-19

End credits, and a home for music and footage licenses.

- **End credits** (Shoot → Reports → End credits):
  - **Built from your project as you go:** opening cards, cast, crew sorted into departments, music, stock footage, filming locations, vendors, special thanks, copyright and legal lines.
  - **Arrange them your way:**
    - reorder sections (drag them, or use ↑↓ on touch);
    - rename headings;
    - leave out a section or a single name;
    - add your own sections;
    - choose each section's style: title cards, two-column roll, centred, or names only.
  - **Live preview:** watch the roll scroll at your chosen speed and runtime.
  - **Export for any editor:**
    - text, as two columns or centred, to paste into a scrolling title in Premiere, Resolve, Final Cut, Avid or Vegas;
    - CSV;
    - an **After Effects script** that builds the finished scrolling comp;
    - **Final Cut XML**, which is new and not yet tested in Final Cut itself;
    - a PDF for checking spelling with cast and crew.
- **Licenses** (Budget → Licenses):
  - **What it tracks:** music, stock and archival footage, photos, fonts, software and other clearances.
  - **Details for each license:**
    - terms, territory, media, dates and fee;
    - status, from Needed to Licensed;
    - the scenes it's used in and its timecodes;
    - the license file itself.
  - **Budget:** fees appear automatically as budget lines, in 4200 Music or the new 4600 Licensing & Clearances account.
  - **Credits:** each license suggests its credit line ("Song" Written by… Performed by… Courtesy of…), which goes straight into the end credits.
  - **Exports:** a music cue sheet and a clearance log (CSV).
  - **Warnings:** music or footage that's in the credits but not yet cleared, and licenses about to expire.

## v0.2.1 — 2026-10-19

Polish from the first round of notes on v0.2.0.

- **More room to work:**
  - **Hide the side panel** on any tab with the ⇤ button or ⌘\ (Ctrl+\), remembered per tab.
  - **The top bar fits at every width:** Share, theme, Edit and Settings stay visible down to iPad size, and the section names shorten as it gets tight.
  - **Phone menu:** Write, Breakdown, Budget and the other sections are dropdowns, so the list isn't crowded.
- **Boards:** one "＋ New board" menu (mood board, whiteboard, story map) that fits the sidebar.
- **Storyboards:** put the Shot Designer's top-down plan in a panel's **set plan** box, with that shot's camera highlighted (at the start, a move point or the end for moving cameras). "Fill set plans from Shot Designer" does every panel at once, and the plans print in the storyboard PDF.
- **Character builder:** your species packs live in the same grid as the built-in ones. Click "Create your own pack" (or drop an `.ogspecies` file on it), and use the ⋯ menu to edit, export, delete or import.
- **Reference:**
  - **Hover menu:** hover "Reference" in the top bar for every topic and page.
  - **Sidebar:** categories collapse.
  - **Crew & departments:** new pages on roles and responsibilities, from producer and 1st AD to 2nd AC, best boy, gaffer and colourist.
  - **Smartphone cinematography:** a new page on sensors, codecs, Apple Log and ProRes, storage and rigging, with a phone recording calculator.
  - **Lens pages:** "f-stops & T-stops" and "Lens mounts & adapters" are now separate pages.
  - **Library:** added DCP-o-matic (free DCP creation) and the Blackmagic Camera app (iOS and Android).
  - **Story structures:** they show where each beat falls on short scripts too, and which scene it currently lands on.

## v0.2.0 — 2026-10-19

A big one: new tools for writing, planning the shoot and sharing, and everything works on phones and iPads.

### Write
- **Screenplay drafts.** Save named drafts, or let Open Gate save one a day while you write and before imports. Read any draft, compare two of them (what was added, cut, changed or moved, and how the page count changed), restore a draft, or copy a single scene back.
- **Scene variants.** Keep alternate versions of a scene ("Ending B") and switch between them.
- **Production revisions.** Lock the White draft and work through Blue, Pink, Yellow and the rest of the colours. Changed lines get a * in the margin, pages that grow become 12A and 12B, and the PDF prints the revision colour and date. Breakdown and Stripboard flag scenes changed since the last draft.
- **Story Bible** (Write → Story Bible): a logline, synopsis, tone and themes, plus:
  - **story days** for every scene, filled in from the scene headings; they feed continuity and the breakdown;
  - places linked to real shooting locations;
  - groups and factions;
  - a glossary;
  - genre-aware rules of the world.
- **Character builder:**
  - relationships, with a relationship map;
  - species packs, plus your own packs, which you can export and import as `.ogspecies` files;
  - archetypes, arcs and custom profile fields.

### Visualize
- **Shot Designer** (Visualize → Shot Designer):
  - a top-down plan for each scene, with actors, cameras, lights, walls and props;
  - each camera's field of view is drawn accurately for its lens and sensor;
  - each camera becomes a Shot List row; a moving camera gets a storyboard panel at its start, at each move point and at its end;
  - pinch, pan and long-press on touch screens.
- **Story maps on the board canvas:**
  - connectors that follow the items they join, with labels, colours, dashes and arrowheads;
  - live cards for characters, places, scenes, locations and shots;
  - `[[links]]` in notes, and character sheets show which boards mention them;
  - templates: relationship map, beat board, story-day timeline, investigation board and places map;
  - auto-arrange as a grid, circle, tree or timeline.

### Budget
- **Gear manifest** (Budget → Gear): mark each item Own, Rent, Borrow or Buy.
  - Rented and bought items become budget lines.
  - It shows how much the gear you own saves you, with an optional insurance and upkeep line.
  - Exports a PDF and a CSV.
- **Budget:**
  - prep and wrap days, rental weeks, overtime and 6th/7th days;
  - named numbers and formulas, and sub-items;
  - flat and per-person fringes, and catering per head;
  - insurance, bond, fee and tax-credit lines;
  - a locked approved budget with a cost report;
  - templates and spreadsheet import;
  - stats per account, per shoot day and per page.

### Reference (new section)
- Plain-language guides to story, camera, lenses, lighting, audio, video and data, grip and power, production and post.
- **Calculators:**
  - depth of field and field of view;
  - crop factor;
  - exposure, ND and shutter angle;
  - gels and colour temperature;
  - light falloff;
  - storage;
  - audio;
  - batteries and power load.
- **Story structures** (Three-Act, Save the Cat, Hero's Journey, Story Circle and more). "Use this structure" adds a beat sheet and puts beat markers in the screenplay's Scenes list.
- A **learn-more library** of channels, websites, books, podcasts and free tools.
- "?" links from the tabs to the right Reference page.

### Sharing
- **Per-tab access.** For every tab, an invite can Edit, View, or not see it at all (Hidden).
  - Presets: Co-writer, AD / scheduling, Department head and Investor view.
  - Hidden tabs are never sent to that person.
  - Older shared projects keep working; the owner can update them for per-tab access from Share.
- Open Gate's own relay is used by default; you can still set your own relay under Advanced.

### Settings
- Settings are now split into **This project** (shared) and **This device**:
  - date style, 12/24-hour clock, week start and units;
  - your name and colour;
  - interface size and reduced motion;
  - storage used and "export all projects";
  - a list of keyboard shortcuts.

### Phones, tablets and stylus
- Every new screen works on phones and iPads.
- Apple Pencil and stylus support where you draw.
- Touch alternatives to drag and drop.
- Tabs recover from errors on their own.
