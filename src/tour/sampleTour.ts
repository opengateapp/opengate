// The guided tour of the sample production: the sections in pipeline order, stopping at each
// deliberate problem the sample has, to say why the warning appears and how to fix it. Offered when
// the sample opens (and in Help); never automatic.

export interface TourStep {
  id: string;
  /** The tab it opens. */
  tab: string;
  title: string;
  body: string;
  /** What to highlight once the tab is open (CSS selector); the step still works without it. */
  anchor?: string;
  /** Opens a view inside the tab (Paperwork → Time cards…). */
  view?: { paperwork?: 'people' | 'docs' | 'clearances' | 'time' };
  /** Marks a deliberate problem in the sample. */
  problem?: boolean;
}

export const SAMPLE_TOUR: TourStep[] = [
  { id: 'welcome', tab: 'screenplay', title: 'The Last Reel', body: 'An 11-page short, filled in across every section, with a few problems left in on purpose. This tour walks the sections in production order and stops at each problem: why the warning appears, and how you’d fix it.', anchor: '.script-editor, .ProseMirror' },
  { id: 'breakdown', tab: 'breakdown', title: 'Breakdown', body: 'Every scene is tagged: props, vehicles, the dog, extras, stunts. Tags feed the shot list, the schedule and the budget, so you only enter things once.' },
  { id: 'stripboard', tab: 'stripboard', title: 'Stripboard', body: 'Three shoot days plus a pickup day for the diner. Drag strips to reorder; the cast’s work days, call sheets and the budget follow the schedule.' },
  { id: 'taft', tab: 'paperwork', view: { paperwork: 'people' }, problem: true, title: 'Problem: Taft-Hartley', anchor: '.license-warnings', body: 'This is a SAG-AFTRA show, and one actor isn’t marked as union. Either they join or you file a Taft-Hartley report for them. Fix: set their union in Paperwork → People, or file the report (the Reference page explains it).' },
  { id: 'release', tab: 'callsheets', problem: true, title: 'Problem: a missing release', anchor: '.cs-note.warn, p.warn.cs-note', body: 'Someone on this call sheet hasn’t signed their release. Fix: send them the release in Paperwork (they can sign it on a phone or iPad) before the day.' },
  { id: 'meal', tab: 'paperwork', view: { paperwork: 'time' }, problem: true, title: 'Problem: a meal penalty', anchor: 'td.warn', body: 'The stunt coordinator was called early, so lunch came more than six hours in: two meal penalties on one time card. Fix: call them later, or break them for a meal sooner (the rules are under the time cards).' },
  { id: 'location', tab: 'locations', problem: true, title: 'Problem: a fourth location', body: 'Rosie’s Diner was added in a later draft: a fourth location and a pickup day, each costing money. On a project started from a budget, Write → Limits warns when a scene adds a location you didn’t plan for.' },
  { id: 'budget', tab: 'budget', title: 'Budget', anchor: '.cap-bar', body: 'Lines follow the breakdown and the schedule; deal memos set the rates. The bar on top compares the total with the cap. Try the versions: Micro-Budget has no stunts allowed.' },
  { id: 'song', tab: 'licenses', problem: true, title: 'Problem: an uncleared song', anchor: '.license-warnings', body: '“Starlite Serenade” plays on the truck radio, but its licence is only requested, not granted. Fix: get the licence, or have a sound-alike ready.' },
  { id: 'festivals', tab: 'festivals', title: 'Festivals', anchor: '.fund-warn', body: 'A festival list with deadlines and fees. The warning: a festival that wants a world premiere screens after another one you planned. Screening at the first may rule you out of the second.' },
  { id: 'social', tab: 'social', problem: true, title: 'Problem: a post without releases', anchor: '.fund-warn, .social-row .warn', body: 'The first-day post shows actors who haven’t signed a release. Fix: get the releases before it goes up; Open Gate asks again when you share.' },
  { id: 'scope', tab: 'distribution', problem: true, title: 'Problem: a licence that doesn’t cover the release', anchor: '.budget-warn', body: 'The song is licensed for festivals and online, but the TV channel wants a trailer. Fix: ask the label to extend the licence to TV and promo, or keep the song out of the trailer.' },
  { id: 'end', tab: 'budget', title: 'That’s the tour', body: 'Everything here is made up, so change or delete anything. To start your own: Home → New screenplay, Import a screenplay, or Start from a budget. Help (?) has the FAQ and this tour.' },
];
