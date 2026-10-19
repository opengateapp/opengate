// Story structures, written in our own words. Ideas and structures aren't owned by anyone, but
// each is credited to the person or tradition it comes from. Beats carry a rough position in the
// story (0–1), used to show target pages against where your scenes actually land.

export interface Beat { name: string; at: number; what: string }
export interface Framework {
  id: string;
  name: string;
  credit: string;
  short: string;
  /** When it fits best. */
  goodFor: string;
  pros: string;
  cons: string;
  beats: Beat[];
}

export const FRAMEWORKS: Framework[] = [
  {
    id: 'three-act', name: 'Three-Act Structure', credit: 'Classical drama; popularised for film by Syd Field',
    short: 'Setup, confrontation, resolution. Two big turning points split the story into roughly 25% / 50% / 25%.',
    goodFor: 'Almost any feature. The common language of development notes.',
    pros: 'Simple, flexible, everyone understands it.', cons: 'Says little about the long middle; easy to sag in Act Two.',
    beats: [
      { name: 'Opening image', at: 0, what: 'A snapshot of the world and the hero before anything changes.' },
      { name: 'Inciting incident', at: 0.1, what: 'Something disrupts normal life and poses the story’s question.' },
      { name: 'Plot point 1', at: 0.25, what: 'The hero commits; there is no going back. Act Two begins.' },
      { name: 'Midpoint', at: 0.5, what: 'A reversal or revelation raises the stakes and changes the goal or approach.' },
      { name: 'Plot point 2', at: 0.75, what: 'The lowest point or a final piece of information launches the ending.' },
      { name: 'Climax', at: 0.9, what: 'The decisive confrontation; the question is answered.' },
      { name: 'Resolution', at: 0.98, what: 'The new normal. Compare with the opening image.' },
    ],
  },
  {
    id: 'save-the-cat', name: 'Save the Cat! beat sheet', credit: 'Blake Snyder',
    short: 'Fifteen beats with suggested page targets, built for commercial features.',
    goodFor: 'Genre features, outlining fast, pitching.', pros: 'Very concrete — tells you what should happen and roughly when.',
    cons: 'Followed too literally it produces predictable scripts.',
    beats: [
      { name: 'Opening image', at: 0, what: 'Before picture of the hero’s world.' },
      { name: 'Setup', at: 0.02, what: 'Hero, stakes and what’s missing in their life.' },
      { name: 'Theme stated', at: 0.05, what: 'Someone hints at the lesson the hero needs, though they don’t get it yet.' },
      { name: 'Catalyst', at: 0.1, what: 'The event that knocks the hero off course.' },
      { name: 'Debate', at: 0.12, what: 'Should I go? The hero hesitates.' },
      { name: 'Break into Two', at: 0.2, what: 'The hero chooses to enter the new world.' },
      { name: 'B story', at: 0.22, what: 'A new relationship that carries the theme.' },
      { name: 'Fun and games', at: 0.3, what: 'The promise of the premise — the scenes the trailer is made of.' },
      { name: 'Midpoint', at: 0.5, what: 'A false victory or false defeat; stakes rise.' },
      { name: 'Bad guys close in', at: 0.55, what: 'Pressure from outside and doubts from inside.' },
      { name: 'All is lost', at: 0.75, what: 'The worst moment; something or someone is lost.' },
      { name: 'Dark night of the soul', at: 0.78, what: 'The hero takes it in and finally learns the lesson.' },
      { name: 'Break into Three', at: 0.8, what: 'A new idea, born from A and B stories together.' },
      { name: 'Finale', at: 0.85, what: 'The hero puts the lesson into action and wins (or loses well).' },
      { name: 'Final image', at: 0.99, what: 'After picture — how much has changed.' },
    ],
  },
  {
    id: 'heros-journey', name: 'The Hero’s Journey', credit: 'Joseph Campbell; adapted for screenwriters by Christopher Vogler',
    short: 'A mythic round trip: leave the ordinary world, face trials in a special world, return changed.',
    goodFor: 'Adventure, fantasy, coming-of-age.', pros: 'Rich archetypes (mentor, threshold guardian, shapeshifter).',
    cons: 'Can feel overfamiliar; less natural for ensemble or quiet character pieces.',
    beats: [
      { name: 'Ordinary world', at: 0, what: 'Where the hero starts, and what they lack.' },
      { name: 'Call to adventure', at: 0.08, what: 'A problem or opportunity appears.' },
      { name: 'Refusal of the call', at: 0.12, what: 'Fear or duty holds them back.' },
      { name: 'Meeting the mentor', at: 0.17, what: 'Advice, a gift or training.' },
      { name: 'Crossing the threshold', at: 0.25, what: 'Committing to the special world.' },
      { name: 'Tests, allies, enemies', at: 0.35, what: 'Learning the new rules.' },
      { name: 'Approach to the inmost cave', at: 0.45, what: 'Preparing for the central ordeal.' },
      { name: 'Ordeal', at: 0.55, what: 'Facing death, literally or figuratively.' },
      { name: 'Reward', at: 0.65, what: 'Seizing the prize, and its consequences.' },
      { name: 'The road back', at: 0.75, what: 'Choosing to return; pursuit or a new complication.' },
      { name: 'Resurrection', at: 0.88, what: 'A final test where the change is proven.' },
      { name: 'Return with the elixir', at: 0.97, what: 'Home again, carrying something that helps others.' },
    ],
  },
  {
    id: 'story-circle', name: 'Story Circle', credit: 'Dan Harmon (after Campbell)',
    short: 'Eight steps around a circle: comfort, need, go, search, find, take, return, change.',
    goodFor: 'TV episodes, shorts, sketches — anything that has to land in a small space.', pros: 'Compact and repeatable; works at every scale.',
    cons: 'Abstract — you still need to invent the specifics.',
    beats: [
      { name: '1. You (comfort zone)', at: 0, what: 'A character in their familiar situation.' },
      { name: '2. Need', at: 0.12, what: 'But they want something.' },
      { name: '3. Go', at: 0.25, what: 'They enter an unfamiliar situation.' },
      { name: '4. Search', at: 0.37, what: 'They adapt to it.' },
      { name: '5. Find', at: 0.5, what: 'They get what they wanted.' },
      { name: '6. Take', at: 0.62, what: 'They pay a heavy price for it.' },
      { name: '7. Return', at: 0.75, what: 'They go back to the familiar situation.' },
      { name: '8. Change', at: 0.88, what: 'Having changed.' },
    ],
  },
  {
    id: 'story-spine', name: 'Story Spine', credit: 'Kenn Adams (improv); made famous by Pixar story artists',
    short: '“Once upon a time… Every day… Until one day… Because of that… Until finally… Ever since then…”',
    goodFor: 'Finding the shape of an idea in five minutes; shorts and animation.', pros: 'Forces cause and effect.',
    cons: 'A sketch, not a full outline.',
    beats: [
      { name: 'Once upon a time…', at: 0, what: 'The world and the character.' },
      { name: 'Every day…', at: 0.08, what: 'Their routine.' },
      { name: 'Until one day…', at: 0.15, what: 'The routine breaks.' },
      { name: 'Because of that…', at: 0.35, what: 'Consequences (repeat as needed).' },
      { name: 'Because of that…', at: 0.55, what: 'Each event causes the next.' },
      { name: 'Until finally…', at: 0.85, what: 'The climax.' },
      { name: 'And ever since then…', at: 0.97, what: 'The new routine.' },
    ],
  },
  {
    id: 'freytag', name: 'Freytag’s Pyramid', credit: 'Gustav Freytag (1863), from Greek and Shakespearean five-act drama',
    short: 'Rising action to a central climax, then falling action to a catastrophe or resolution.',
    goodFor: 'Tragedy, stage adaptations, classical structure.', pros: 'Clear rise and fall.',
    cons: 'Puts the climax in the middle, which feels early to modern film audiences.',
    beats: [
      { name: 'Exposition', at: 0, what: 'Who, where, what’s at stake.' },
      { name: 'Rising action', at: 0.2, what: 'Complications build.' },
      { name: 'Climax', at: 0.5, what: 'The turning point of the hero’s fortunes.' },
      { name: 'Falling action', at: 0.7, what: 'Consequences unfold.' },
      { name: 'Catastrophe / resolution', at: 0.92, what: 'The ending, tragic or not.' },
    ],
  },
  {
    id: 'seven-point', name: 'Seven-Point Story Structure', credit: 'Dan Wells (after the Star Trek RPG guide)',
    short: 'Start from the resolution, then design the hook as its opposite, with two pinches and two plot turns in between.',
    goodFor: 'Thrillers and genre stories with a strong arc.', pros: 'Planning backwards keeps the ending earned.',
    cons: 'Little guidance on scene-by-scene pacing.',
    beats: [
      { name: 'Hook', at: 0, what: 'The starting state — the opposite of the ending.' },
      { name: 'Plot turn 1', at: 0.2, what: 'The call; the world changes.' },
      { name: 'Pinch 1', at: 0.35, what: 'Pressure from the antagonist forces action.' },
      { name: 'Midpoint', at: 0.5, what: 'Reacting becomes acting.' },
      { name: 'Pinch 2', at: 0.65, what: 'Things get as bad as they can; the plan fails.' },
      { name: 'Plot turn 2', at: 0.8, what: 'The final key the hero needs.' },
      { name: 'Resolution', at: 0.95, what: 'The end state.' },
    ],
  },
  {
    id: 'fichtean', name: 'Fichtean Curve', credit: 'Named after Johann Gottlieb Fichte; described by John Gardner',
    short: 'Start in crisis and keep raising it: a series of escalating crises to the climax, little setup.',
    goodFor: 'Thrillers, horror, survival stories.', pros: 'Grabs attention fast; backstory comes in flashes.',
    cons: 'Tiring if every crisis is the same size.',
    beats: [
      { name: 'First crisis', at: 0.02, what: 'Open in the middle of trouble.' },
      { name: 'Crisis 2', at: 0.25, what: 'Bigger; reveals more of the past.' },
      { name: 'Crisis 3', at: 0.5, what: 'Bigger again.' },
      { name: 'Crisis 4', at: 0.7, what: 'The last one before the end.' },
      { name: 'Climax', at: 0.88, what: 'The peak.' },
      { name: 'Falling action', at: 0.96, what: 'A short wind-down.' },
    ],
  },
  {
    id: 'kishotenketsu', name: 'Kishōtenketsu', credit: 'Chinese and Japanese four-part composition',
    short: 'Introduction, development, twist, reconciliation — structure built on contrast rather than conflict.',
    goodFor: 'Slice-of-life, gentle drama, animation, shorts.', pros: 'Doesn’t need a villain or fight.',
    cons: 'Needs a strong twist idea to hold attention.',
    beats: [
      { name: 'Ki — introduction', at: 0, what: 'Characters and setting.' },
      { name: 'Shō — development', at: 0.25, what: 'Deepening, with no big change.' },
      { name: 'Ten — twist', at: 0.5, what: 'Something unexpected and seemingly unrelated.' },
      { name: 'Ketsu — reconciliation', at: 0.75, what: 'The parts come together into a new understanding.' },
    ],
  },
  {
    id: 'four-act-tv', name: 'TV act structure (teaser + acts)', credit: 'Broadcast television practice',
    short: 'A cold open/teaser, then four or five acts that each end on a hook before the break.',
    goodFor: 'Episodic TV, web series.', pros: 'Built-in rhythm of hooks.', cons: 'Streaming shows are looser about breaks.',
    beats: [
      { name: 'Teaser / cold open', at: 0, what: 'Hook the viewer before the titles.' },
      { name: 'Act 1 out', at: 0.25, what: 'The problem of the episode is clear.' },
      { name: 'Act 2 out', at: 0.5, what: 'A complication or reversal.' },
      { name: 'Act 3 out', at: 0.75, what: 'The darkest moment or biggest cliffhanger.' },
      { name: 'Act 4 / tag', at: 0.92, what: 'Resolution, plus a tag that sets up what’s next.' },
    ],
  },
  {
    id: 'eight-sequence', name: 'Sequence approach (8 sequences)', credit: 'Frank Daniel; taught by Paul Gulino',
    short: 'A feature as eight 10–15 minute sequences, each with its own mini goal — like reels in early cinema.',
    goodFor: 'Taming the long middle of a feature.', pros: 'Every 12 pages has a shape.', cons: 'More planning up front.',
    beats: Array.from({ length: 8 }, (_, i) => ({ name: `Sequence ${String.fromCharCode(65 + i)}`, at: i / 8, what: ['Status quo and inciting incident', 'Predicament and lock-in', 'First obstacles, first attempt', 'Midpoint build', 'Subplot and new complications', 'Main tension peaks; second culmination', 'New tension, twists', 'Resolution'][i] })),
  },
  {
    id: 'in-medias-res', name: 'In medias res', credit: 'Horace (Ars Poetica)',
    short: 'Open in the middle of the action, then fill in how we got here.',
    goodFor: 'Openings that need a jolt; mysteries.', pros: 'Instant intrigue.', cons: 'The flashback has to be worth it.',
    beats: [
      { name: 'Flash-forward / middle of the action', at: 0, what: 'A gripping moment from later on.' },
      { name: 'Rewind', at: 0.05, what: 'Back to the start.' },
      { name: 'Catch up to the opening', at: 0.6, what: 'The story reaches the scene we opened with — now we understand it.' },
      { name: 'Beyond', at: 0.75, what: 'What happens next is new to us.' },
    ],
  },
];

export interface Arc { name: string; what: string; example: string }

/** Character arcs, matching the arc field on character profiles. */
export const ARC_GUIDE: Arc[] = [
  { name: 'Positive change', what: 'The character believes something false about themselves or the world, and learning the truth lets them win.', example: 'A loner who learns to trust a team.' },
  { name: 'Flat / steadfast', what: 'The character already knows the truth; they change the world around them instead of changing themselves.', example: 'A principled outsider who wakes up a town.' },
  { name: 'Disillusionment', what: 'The character learns a truth, but it’s a hard one that leaves them sadder or wiser.', example: 'A believer who discovers the cause was corrupt.' },
  { name: 'Fall', what: 'The character rejects the truth and ends worse off — often destroying themselves.', example: 'Ambition curdles into ruin.' },
  { name: 'Corruption', what: 'A good character embraces something false and becomes worse.', example: 'A decent person seduced by power.' },
  { name: 'Redemption', what: 'A character who did wrong earns their way back.', example: 'A deserter who returns to save the unit.' },
  { name: 'Moral ascent', what: 'The character grows step by step toward selflessness.', example: 'A cynic who ends up sacrificing for others.' },
  { name: 'Moral descent', what: 'Step by step, each compromise makes the next one easier.', example: 'Small lies become a criminal life.' },
  { name: 'Testing', what: 'The character’s values are tested over and over and hold.', example: 'A witness who won’t be bribed or scared off.' },
];

/** Target page for a beat in a script of `pages` pages. */
export const beatPage = (b: Beat, pages: number) => Math.max(1, Math.round(b.at * pages) || 1);

/** Minimal script layout needed to place beats (see script/derive). */
interface Layout {
  scenes: { id: string; number: string; heading: string; index: number }[];
  pagination: { pages: { lines: unknown[] }[]; blockStart: { page: number; row: number }[]; scenes: { blockIndex: number }[] };
}

const ROWS = 54;

/**
 * Where each beat should fall in this script, in pages from the start (fractional), and the scene
 * that's actually there now. Works for short scripts too (a 2-page short still has a midpoint).
 */
export function placeBeats(fw: Framework, d: Layout): { beat: Beat; page: number; pct: number; sceneId?: string; label: string }[] {
  const total = Math.max(1 / ROWS, d.pagination.pages.length ? (d.pagination.pages.length - 1) + (d.pagination.pages[d.pagination.pages.length - 1].lines.length / ROWS) : 0);
  const starts = d.scenes.map((s) => {
    const b = d.pagination.blockStart[d.pagination.scenes[s.index]?.blockIndex ?? 0] ?? { page: 0, row: 0 };
    return { id: s.id, at: b.page + b.row / ROWS };
  });
  return fw.beats.map((beat) => {
    const target = beat.at * total;
    let sceneId: string | undefined;
    for (const st of starts) { if (st.at <= target + 1e-6) sceneId = st.id; else break; }
    const page = target + 1;
    const label = total < 20 ? `p. ${page.toFixed(1)}` : `p. ${Math.round(page)}`;
    return { beat, page, pct: Math.round(beat.at * 100), sceneId: sceneId ?? starts[0]?.id, label };
  });
}
