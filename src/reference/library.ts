// "Learn more" library: places to keep learning, each described in one line of our own.
// No affiliate links. Bundled with the app so it works offline.

export type ResourceType = 'youtube' | 'website' | 'book' | 'podcast' | 'tool';
export type Level = 'beginner' | 'intermediate' | 'advanced' | 'all';

export interface Resource {
  id: string;
  name: string;
  url: string;
  type: ResourceType;
  topics: string[];
  level: Level;
  free: boolean;
  desc: string;
  by?: string;
}

export const RESOURCE_TYPES: { id: ResourceType; label: string }[] = [
  { id: 'youtube', label: 'YouTube' }, { id: 'website', label: 'Websites' }, { id: 'book', label: 'Books' }, { id: 'podcast', label: 'Podcasts' }, { id: 'tool', label: 'Free tools' },
];

export const TOPIC_LABELS: Record<string, string> = {
  story: 'Story', screenwriting: 'Screenwriting', directing: 'Directing', cinematography: 'Cinematography', camera: 'Camera', lenses: 'Lenses',
  lighting: 'Lighting', audio: 'Sound', grip: 'Grip', production: 'Producing', post: 'Post', editing: 'Editing', data: 'Data', vfx: 'VFX',
};

export const LIBRARY: Resource[] = [
  // YouTube
  { id: 'studiobinder-yt', name: 'StudioBinder', url: 'https://www.youtube.com/@StudioBinder', type: 'youtube', topics: ['directing', 'cinematography', 'screenwriting'], level: 'beginner', free: true, desc: 'Clear explainers on shots, directing techniques and screenwriting, using famous scenes.' },
  { id: 'film-riot', name: 'Film Riot', url: 'https://www.youtube.com/@filmriot', type: 'youtube', topics: ['directing', 'vfx', 'production'], level: 'beginner', free: true, desc: 'Practical indie filmmaking: how-tos, low-budget effects and behind the scenes of their own shorts.' },
  { id: 'every-frame', name: 'Every Frame a Painting', url: 'https://www.youtube.com/@everyframeapainting', type: 'youtube', topics: ['editing', 'directing'], level: 'intermediate', free: true, desc: 'A short, finished series of video essays on film form — still some of the best on editing and staging.' },
  { id: 'lessons-screenplay', name: 'Lessons from the Screenplay', url: 'https://www.youtube.com/@LessonsfromtheScreenplay', type: 'youtube', topics: ['screenwriting', 'story'], level: 'intermediate', free: true, desc: 'Breaks down how specific screenplays work on the page.' },
  { id: 'in-depth-cine', name: 'In Depth Cine', url: 'https://www.youtube.com/@InDepthCine', type: 'youtube', topics: ['cinematography', 'lighting', 'camera', 'lenses'], level: 'intermediate', free: true, desc: 'Calm, detailed cinematography: lighting setups, lenses, and how famous films were shot.' },
  { id: 'wolfcrow', name: 'Wolfcrow', url: 'https://www.youtube.com/@wolfcrow', type: 'youtube', topics: ['camera', 'cinematography', 'lenses'], level: 'intermediate', free: true, desc: 'Camera technology and cinematography theory, explained thoroughly.' },
  { id: 'filmmaker-iq', name: 'Filmmaker IQ', url: 'https://www.youtube.com/@FilmmakerIQ', type: 'youtube', topics: ['camera', 'cinematography', 'audio'], level: 'intermediate', free: true, desc: 'The science and history behind filmmaking tools — sensors, frame rates, colour, sound.' },
  { id: 'gerald-undone', name: 'Gerald Undone', url: 'https://www.youtube.com/@GeraldUndone', type: 'youtube', topics: ['camera', 'audio'], level: 'intermediate', free: true, desc: 'Meticulous camera and audio gear reviews and tests.' },
  { id: 'potato-jet', name: 'Potato Jet', url: 'https://www.youtube.com/@potatojet', type: 'youtube', topics: ['camera', 'grip'], level: 'beginner', free: true, desc: 'Friendly, fun gear reviews and shooting tips.' },
  { id: 'wandering-dp', name: 'Wandering DP', url: 'https://www.youtube.com/@WanderingDP', type: 'youtube', topics: ['cinematography', 'lighting'], level: 'intermediate', free: true, desc: 'Breakdowns of how scenes were lit, often from stills and frame analysis.' },
  { id: 'aputure', name: 'Aputure', url: 'https://www.youtube.com/@aputurelighting', type: 'youtube', topics: ['lighting'], level: 'beginner', free: true, desc: 'Lighting tutorials and setups (from a light maker, but broadly useful).' },
  { id: 'curtis-judd', name: 'Curtis Judd', url: 'https://www.youtube.com/@curtisjudd', type: 'youtube', topics: ['audio'], level: 'all', free: true, desc: 'Location sound done right: mics, recorders, technique.' },
  { id: 'd4darious', name: 'D4Darious', url: 'https://www.youtube.com/@D4Darious', type: 'youtube', topics: ['directing', 'cinematography'], level: 'beginner', free: true, desc: 'Filmmaking craft from a working director’s point of view.' },
  { id: 'corridor', name: 'Corridor Crew', url: 'https://www.youtube.com/@CorridorCrew', type: 'youtube', topics: ['vfx'], level: 'all', free: true, desc: 'VFX artists react to and recreate effects — entertaining and educational.' },
  { id: 'team2films', name: 'Team 2 Films', url: 'https://www.youtube.com/@Team2Films', type: 'youtube', topics: ['production', 'camera'], level: 'beginner', free: true, desc: 'Indie and freelance filmmaking: gear, business and shooting tips.' },
  { id: 'this-guy-edits', name: 'This Guy Edits', url: 'https://www.youtube.com/@ThisGuyEdits', type: 'youtube', topics: ['editing', 'post'], level: 'all', free: true, desc: 'Editing craft and workflow from a working editor.' },
  // Websites
  { id: 'studiobinder-blog', name: 'StudioBinder blog', url: 'https://www.studiobinder.com/blog/', type: 'website', topics: ['production', 'directing', 'screenwriting'], level: 'beginner', free: true, desc: 'Long-form guides on almost every production topic.' },
  { id: 'nofilmschool', name: 'No Film School', url: 'https://nofilmschool.com/', type: 'website', topics: ['production', 'directing', 'screenwriting'], level: 'all', free: true, desc: 'News, interviews and how-tos for independent filmmakers.' },
  { id: 'asc', name: 'American Cinematographer', url: 'https://theasc.com/', type: 'website', topics: ['cinematography', 'lighting'], level: 'advanced', free: true, desc: 'The ASC’s magazine: cinematographers explain how they shot current films.' },
  { id: 'cined', name: 'CineD', url: 'https://www.cined.com/', type: 'website', topics: ['camera', 'lenses'], level: 'intermediate', free: true, desc: 'Camera news and standardised lab tests of dynamic range and rolling shutter.' },
  { id: 'frameio-insider', name: 'Frame.io Insider', url: 'https://blog.frame.io/', type: 'website', topics: ['post', 'editing', 'data'], level: 'intermediate', free: true, desc: 'Deep articles on post-production workflow, colour and delivery.' },
  { id: 'netflix-partner', name: 'Netflix Partner Help Center', url: 'https://partnerhelp.netflixstudios.com/', type: 'website', topics: ['camera', 'post', 'production'], level: 'advanced', free: true, desc: 'Camera, production and delivery guides published for Netflix productions — useful standards for anyone.' },
  { id: 'go-into-the-story', name: 'Go Into The Story', url: 'https://gointothestory.blcklst.com/', type: 'website', topics: ['screenwriting', 'story'], level: 'all', free: true, desc: 'The Black List’s screenwriting blog: craft, analysis and interviews.' },
  { id: 'black-list', name: 'The Black List', url: 'https://blcklst.com/', type: 'website', topics: ['screenwriting'], level: 'advanced', free: false, desc: 'Script hosting and evaluation service, plus the annual list of liked unproduced scripts.' },
  { id: 'bbc-writersroom', name: 'BBC Writersroom script library', url: 'https://www.bbc.co.uk/writers/scripts', type: 'website', topics: ['screenwriting'], level: 'all', free: true, desc: 'Free scripts from BBC film, TV and radio to read and learn from.' },
  { id: 'script-slug', name: 'Script Slug', url: 'https://www.scriptslug.com/', type: 'website', topics: ['screenwriting'], level: 'all', free: true, desc: 'A large free library of film and TV screenplays as PDFs.' },
  { id: 'filmfreeway', name: 'FilmFreeway', url: 'https://filmfreeway.com/', type: 'website', topics: ['production'], level: 'all', free: true, desc: 'Find and submit to film festivals and screenplay competitions.' },
  { id: 'shotdeck', name: 'ShotDeck', url: 'https://shotdeck.com/', type: 'website', topics: ['cinematography', 'directing'], level: 'all', free: false, desc: 'Searchable library of film stills for references and mood boards (paid).' },
  // Podcasts
  { id: 'scriptnotes', name: 'Scriptnotes', url: 'https://johnaugust.com/podcast', type: 'podcast', topics: ['screenwriting'], level: 'all', free: true, desc: 'Two working screenwriters on craft and the business of writing.', by: 'John August & Craig Mazin' },
  { id: 'team-deakins', name: 'Team Deakins', url: 'https://www.teamdeakins.com/', type: 'podcast', topics: ['cinematography', 'directing'], level: 'all', free: true, desc: 'Roger and James Deakins talk with filmmakers across every department.' },
  // Free tools
  { id: 'resolve', name: 'DaVinci Resolve', url: 'https://www.blackmagicdesign.com/products/davinciresolve', type: 'tool', topics: ['editing', 'post'], level: 'all', free: true, desc: 'Professional editing, colour, effects and audio — the free version is very capable.' },
  { id: 'kdenlive', name: 'Kdenlive', url: 'https://kdenlive.org/', type: 'tool', topics: ['editing'], level: 'beginner', free: true, desc: 'Open-source video editor for Windows, Mac and Linux.' },
  { id: 'audacity', name: 'Audacity', url: 'https://www.audacityteam.org/', type: 'tool', topics: ['audio'], level: 'beginner', free: true, desc: 'Open-source audio editor for cleaning up and editing sound.' },
  // Books
  ...([
    ['save-the-cat', 'Save the Cat!', 'Blake Snyder', ['screenwriting', 'story'], 'beginner', 'Beat sheets and genre thinking for commercial screenplays.'],
    ['story-mckee', 'Story', 'Robert McKee', ['screenwriting', 'story'], 'intermediate', 'A thorough look at the principles behind story, scene and structure.'],
    ['writers-journey', 'The Writer’s Journey', 'Christopher Vogler', ['story'], 'intermediate', 'The Hero’s Journey adapted for screenwriters, with archetypes.'],
    ['screenplay-field', 'Screenplay', 'Syd Field', ['screenwriting'], 'beginner', 'The book that set the three-act paradigm for modern screenwriting.'],
    ['anatomy-story', 'The Anatomy of Story', 'John Truby', ['story'], 'advanced', 'Twenty-two steps built from character and moral argument, not page counts.'],
    ['into-the-woods', 'Into the Woods', 'John Yorke', ['story'], 'intermediate', 'Why stories share a shape, from a British TV drama veteran.'],
    ['hollywood-standard', 'The Hollywood Standard', 'Christopher Riley', ['screenwriting'], 'all', 'The reference for screenplay formatting questions.'],
    ['shot-by-shot', 'Film Directing Shot by Shot', 'Steven D. Katz', ['directing', 'cinematography'], 'intermediate', 'Visualising a film: staging, coverage and storyboards.'],
    ['grammar-shot', 'Grammar of the Shot', 'Christopher Bowen', ['cinematography'], 'beginner', 'Framing, composition and shot types, clearly illustrated.'],
    ['directing-actors', 'Directing Actors', 'Judith Weston', ['directing'], 'intermediate', 'How to talk to actors so performances come alive.'],
    ['making-movies', 'Making Movies', 'Sidney Lumet', ['directing', 'production'], 'all', 'A great director walks through every stage of making a film.'],
    ['rebel-crew', 'Rebel Without a Crew', 'Robert Rodriguez', ['production'], 'beginner', 'The diary of making El Mariachi for almost nothing — pure inspiration.'],
    ['cine-theory', 'Cinematography: Theory and Practice', 'Blain Brown', ['cinematography', 'lighting', 'camera', 'lenses'], 'intermediate', 'A complete textbook on the camera department.'],
    ['painting-light', 'Painting with Light', 'John Alton', ['lighting'], 'advanced', 'The classic noir cinematographer on lighting for mood.'],
    ['set-lighting', 'Set Lighting Technician’s Handbook', 'Harry C. Box', ['lighting', 'grip'], 'advanced', 'The electrician’s bible: fixtures, power and safety.'],
    ['sound-bible', 'The Location Sound Bible', 'Ric Viers', ['audio'], 'beginner', 'Recording good dialogue on location.'],
    ['blink-eye', 'In the Blink of an Eye', 'Walter Murch', ['editing'], 'all', 'A short, thoughtful essay on why and where to cut.'],
    ['filmmakers-handbook', 'The Filmmaker’s Handbook', 'Steven Ascher & Edward Pincus', ['production', 'camera', 'post'], 'all', 'An encyclopaedic guide to the whole process.'],
    ['fpm101', 'Film Production Management 101', 'Deborah S. Patz', ['production'], 'intermediate', 'Running the production office: budgets, schedules, paperwork.'],
  ] as const).map(([id, name, by, topics, level, desc]) => ({ id, name, by, url: `https://openlibrary.org/search?q=${encodeURIComponent(`${name} ${by}`)}`, type: 'book' as const, topics: [...topics], level, free: false, desc })),
];

/** A few picks for a reference page's topics: free and beginner-friendly first. */
export function learnMore(topics: string[], n = 4): Resource[] {
  const score = (r: Resource) => r.topics.filter((t) => topics.includes(t)).length * 10 + (r.free ? 2 : 0) + (r.level === 'beginner' || r.level === 'all' ? 1 : 0) + (r.type === 'book' ? -1 : 0);
  const hits = LIBRARY.filter((r) => r.topics.some((t) => topics.includes(t))).sort((a, b) => score(b) - score(a));
  // Mix types so it's not four YouTube channels.
  const out: Resource[] = [];
  for (const type of ['youtube', 'website', 'book', 'podcast', 'tool'] as const) { const r = hits.find((x) => x.type === type && !out.includes(x)); if (r) out.push(r); }
  for (const r of hits) if (out.length < n && !out.includes(r)) out.push(r);
  return out.slice(0, n);
}
