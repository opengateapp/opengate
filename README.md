# Open Gate

Free, open-source production management in one synced project: **write** the screenplay, **break it down**, plan a **shot list**, build the **stripboard**, and lay it on a **calendar**. Everything reads from the same script, so a change in one tab shows up in all the others.

> Working name. Licensed GPL-3.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
>
> Built on [CineSched](https://github.com/ChrisTempel/CineSched) by [Christopher Tempel](https://github.com/ChrisTempel) and [alucardGonza](https://github.com/alucardGonza) ([CineSched_D.G.D](https://github.com/alucardGonza/CineSched_D.G.D)), and the free tools by [Inwood Park Productions](https://github.com/InwoodParkProductions): [Don't Pay for Screenwriting Software](https://github.com/InwoodParkProductions/Don-t-Pay-for-Screenwriting-Software), [Don't Pay for Storyboarding Software](https://github.com/InwoodParkProductions/DontPayforStoryboardingSoftware) and [Shot List for Free](https://github.com/InwoodParkProductions/Shot-List-For-Free).

**Use it in your browser:** https://opengateapp.github.io/opengate/ (works offline once loaded; install it from the address bar as a desktop app).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run build      # static site in dist/
```

## Saving and working offline

- Every change is saved in the browser as you go (IndexedDB), online or off. The browser is asked to keep that storage permanently.
- **Save** (⌘S) and **Save As…** (⇧⌘S) in the ▤ menu write a portable `.opengate` file. In Chrome and Edge, Open Gate remembers the file and **autosaves to it** (5 s after you stop editing; switch it off in the menu). After a reload the browser asks for one click to allow writing again. Safari and Firefox can't write back to a file, so Save As downloads a copy there. Older `.slateline` files still open.
- A saved file of a **shared** project stays linked to it: opening it on any computer reconnects and merges whatever changed meanwhile. **Save independent copy…** makes a file with a new id and no sharing, for a fork or an archive.
- The built app works offline (a service worker caches it; install it from the browser's address bar as a desktop app). Collaborators' changes queue up while you're offline and merge when you reconnect.

## Sharing and collaboration

No accounts. Projects are shared through a small relay you deploy once for free ([relay/](relay/README.md)).

- **Share** (top right) → paste your relay address → **Start sharing**. Then **Invite someone**: choose **Can edit everything**, **View only**, or **Can edit only these sections** (Write, Breakdown, Plan, Visualize, Shoot, Settings), and copy or email the link. Every link can be revoked on its own; **Stop sharing** ends it for everyone.
- **End-to-end encrypted.** The project key lives only in the part of the link after `#`, which browsers never send to a server. The relay stores and forwards encrypted updates it can't read; it only checks which sections each link may change.
- **Live:** edits, script typing (with collaborators' cursors) and board changes appear for everyone at once. People with section links can still tag the script in Breakdown or mark shots in Visualize, but not change its text.
- **Budget privacy:** invite links have a separate *Budget* choice (hidden / can see / can see and edit); see [Budget](#budget).
- **Offline:** keep working; changes are queued and merge on reconnect. Edits to different things all survive; if two people changed the same item, one version wins on every copy.
- **Review merged changes** (the Review button): changes from collaborators are grouped by person and section. **Accept** keeps a change, **Reject** undoes it for everyone (script changes show the before/after paragraphs). If your version of an item replaced someone else's offline edit, it's marked, with **Use theirs** to switch to their version.

## How the tabs stay in sync

- The screenplay is a single ProseMirror document. Every scene heading carries a stable `sceneId`.
- Scenes are **derived** from the document (INT/EXT, set, time of day, characters, page length in eighths). Nothing is copied, so the breakdown, shot list, stripboard and calendar always show the current script.
- Breakdown tags and shot anchors are **marks on the script text** — they move with the words as you edit.
- Strips, shots and elements refer to scenes by id. If a scene is deleted, its strips are flagged under **sync issues** instead of silently vanishing.
- Re-importing a revised draft keeps scene ids for headings that didn't change, so tags, shots and schedule placement survive.

## Sections

| Section | Tabs |
|---|---|
| **Write** | **Screenplay** (editor + import of Fountain, FDX, PDF, Word, Highland, Celtx, CineSched) · **A/V Scripts** (two-column video / audio with segments, timings, PDF/CSV) · **Docs** (treatments, director's notes; templates, Markdown/HTML export) |
| **Breakdown** | **Script Breakdown** (tag into 21 categories, breakdown sheets, element manager) · **Stripboard** · **Day Out of Days** · **Script Sides** |
| **Budget** | **Budget** (top sheet, accounts, lines linked to the breakdown, targets, actuals, versions; PDF / Excel) · **Expenses** (receipts, bank / card CSV import) |
| **Plan** | **Contacts** (cast, crew and other contacts; vCard import/export) · **Calendar** (shoot days, events, tasks; `.ics` export) · **Tasks** (due dates, owners, departments; drag onto calendar days) |
| **Visualize** | **Storyboards** · **Mood Boards** (mood boards and whiteboards, Pinterest import) · **Shot Lists** |
| **Shoot** | **Call Sheets** (editable page: company + key contacts, logo, production title, times with live lunch / sunrise / sunset / weather, hospital, map, big call time, notes; sections you can hide, reorder, rename, remove or add — locations, advance schedule, notes boxes, walkie channels, background, vendors, transportation, equipment or blank tables; Download / Send PDF; duplicate to another day; copy layout to all days) · **Locations** (contacts, permits, logistics, scout photos, linked mood images, scenes and shoot days) · **Reports** (every export) |
| ⚙ | Project settings: production info, cast roster details, crew, categories, strip colors |

Drag-and-drop and double-click-to-add work throughout: drop images onto boards, storyboards and locations; drop `.vcf` cards onto Contacts; drag strips, shots, A/V rows and tasks to reorder; drag tasks onto calendar days; double-click empty space on a board, stripboard day, shot list, A/V script, task list, contacts table or side list to add something there.

## Budget

An industry-style budget: a top sheet (above the line, below the line, post, other) of numbered accounts, each with detail lines of quantity × units × multiplier × rate, plus fringes (payroll taxes, union pension & health, with caps) and contingency. Pick how you're working from the **View** menu:

- **Build from breakdown** — *Update from breakdown* adds a line for every cast member (work and hold days from the Day Out of Days), crew member (shoot days), location (days shooting there; its fee becomes the rate) and tagged element (props, wardrobe, vehicles…), plus per-day catering. Linked quantities (⛓) follow the script and schedule: move a scene to another day and the budget updates. Type a quantity to unlink a line; click ⛓ to link it again. You fill in the rates.
- **Top-down target** — enter the all-in total; a contingency reserve is set aside and the rest is split across accounts (a typical split, by your current estimates, or by hand). Each account shows how much room is left or how far over it is.
- **Actual spending** — estimate vs. spent per account, from the **Expenses** tab: drop receipt photos or PDFs, or import a CSV export from your bank or card (columns are matched for you; deposits are skipped).
- **Scenarios** — versions such as Lean / Target / Ideal or 12 vs. 15 shoot days, compared side by side. A version keeps its own quantities, rates, added and removed lines; per-day lines follow its shoot length.

Exports: budget PDF (top sheet + detail) and an Excel workbook (top sheet, detail with live formulas, expenses), from the Budget bar or Shoot → Reports.

**Who sees it:** in a shared project the budget is private by default. It's encrypted with its own key, which only goes into invite links where you choose *Budget: Can see* or *Can see and edit*; "Can edit everything" doesn't include it. Without that key the relay never sends the budget or its receipts.

## On your phone

Open Gate works on phones and tablets (add it to your home screen from the browser's share menu).

- **☰** opens the sections and tabs; **⋯** holds Share, Review, Undo/Redo, theme and settings, and each toolbar's less-used actions.
- **Open Gate Lite** (on by default on phones) shows a short list of tabs: Screenplay, Call Sheets, Stripboard, Calendar, Tasks, Contacts, Locations, Shot Lists and Expenses. Add, remove or reorder tabs in **Settings → Phone layout**, or tick "Show all tabs" in the ☰ menu.
- Side panels (scenes, boneyard, breakdown sheet, lists) open as sheets from the buttons at the bottom; tables become cards.
- **Long-press** (or right-click on a computer) a strip, task, shot, A/V row or budget line for actions like *Move to day…*, *Move up/down* and *Move to account…* — the touch version of drag-and-drop.
- The screenplay fills the screen, with an element bar (Scene, Action, Character, Dialogue…) above the keyboard. Mood boards pan with one finger and zoom with two.

## Appearance

Light / dark / system mode, built-in color themes, and custom colors for each mode. **Save as theme…** keeps your colors under a name (double-click to rename, right-click to delete), and **Export / Import themes** moves them to another browser.

## Mood boards and whiteboards

- Infinite canvas: pan (space-drag, hand tool or scroll), zoom (⌘-scroll / pinch, `0` to fit), marquee select, move, resize, duplicate (⌘D), delete, bring forward/back (`]` / `[`).
- Add by **dropping** image files or images dragged from another browser tab (the page link is kept as the source), **pasting** (⌘V) images, links or text, or **double-clicking** for notes, text, images, links, color swatches, shapes, arrows and section frames. Pen tool for sketching.
- **Link to the production** by dragging items onto a scene, location, character or shot in the left panel. Linked images then appear on that scene's breakdown sheet and that location's page.
- **Pinterest:** drag the "Send to Open Gate" bookmark to your bookmarks bar (Mood Boards → Import Pinterest), open a board on pinterest.com and click it. Pins arrive with captions, the original source link and the pin link, grouped into one section frame per Pinterest section. It uses Pinterest's own site data in your signed-in tab (there is no public API), so a Pinterest site change can break it; it then falls back to reading the pins on the page.
- **Live editing:** in a shared project, boards are edited together like everything else, and the board shows who else is on it. Images travel through the relay encrypted.

## Next phases

- **Phase 3:** revision colors and locked pages, desktop app (Tauri), live Google Calendar sync.

## Code map

```
src/model/       types, defaults (categories, colors, shot options), dates
src/script/      ProseMirror schema, editor commands, paginator, scene derivation, tagging
src/io/          importers (fountain, fdx, pdf, docx, highland, celtx, cinesched), reports, project files
src/schedule/    stripboard engine (cascade, conflicts, lock, moves), call sheets, Day Out of Days, iCalendar export
src/pdf/         screenplay, sides, stripboard, shooting schedule, call sheet, DOOD, breakdown sheet and storyboard PDFs (jsPDF)
src/store/       Zustand store with undo, IndexedDB autosave, storyboard media blobs
src/budget/      chart of accounts, budget math, breakdown links, expenses CSV, PDF/Excel data
src/sync/        sharing: encryption, per-section Yjs documents, relay connection, offline queue, change review
src/tabs/        one component per tab (boards/ = canvas, Pinterest)
relay/           Cloudflare Worker relay for shared projects
```
