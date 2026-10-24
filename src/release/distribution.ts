import type { Deliverable, DeliverableStatus, License, Outlet, OutletKind, OutletStatus, Project, ReleaseRight } from '../model/types';
import { newId } from '../model/ids';
import { joinFestivals } from '../budget/festivals';

// Release → Distribution: what you have to hand over (deliverables), who might release the film
// (sales agents, distributors, platforms), and whether your licences cover where it's going.

export const DELIVERABLE_GROUPS: { id: Deliverable['group']; label: string }[] = [
  { id: 'picture', label: 'Picture' }, { id: 'sound', label: 'Sound' }, { id: 'captions', label: 'Captions & subtitles' },
  { id: 'legal', label: 'Legal & paperwork' }, { id: 'marketing', label: 'Marketing' }, { id: 'other', label: 'Other' },
];
export const DELIVERABLE_STATUSES: { id: DeliverableStatus; label: string }[] = [
  { id: 'todo', label: 'To do' }, { id: 'doing', label: 'In progress' }, { id: 'done', label: 'Done' }, { id: 'na', label: 'Not needed' },
];

/** The usual list for festivals and a first distribution deal. Notes say what each is. */
export const DELIVERABLE_TEMPLATE: { name: string; group: Deliverable['group']; notes: string; tab?: string }[] = [
  { name: 'DCP (Digital Cinema Package)', group: 'picture', notes: 'For festival and cinema screenings. Test it on a real projector before you send it.' },
  { name: 'ProRes master (picture lock, graded)', group: 'picture', notes: 'The highest-quality file of the finished film: ProRes 422 HQ or 4444, with textless versions of any shots that have titles.' },
  { name: 'Screener (password-protected link)', group: 'picture', notes: 'An online link for programmers and buyers, usually Vimeo with a password.' },
  { name: 'Stereo mix', group: 'sound', notes: 'Full mix, stereo.' },
  { name: '5.1 surround mix', group: 'sound', notes: 'Asked for by cinemas and some distributors.' },
  { name: 'M&E stems (music & effects, no dialogue)', group: 'sound', notes: 'Lets foreign distributors dub the film. Separate dialogue, music and effects tracks.' },
  { name: 'Captions / SDH (English)', group: 'captions', notes: 'Subtitles for the deaf and hard of hearing; most platforms require them.' },
  { name: 'Subtitles (other languages)', group: 'captions', notes: 'For festivals abroad: English subtitles if the film isn’t in English.' },
  { name: 'Dialogue list / continuity script', group: 'captions', notes: 'Every line with its timecode, for subtitlers.' },
  { name: 'Music cue sheet', group: 'legal', notes: 'Every piece of music, how long it plays and who owns it (Budget → Licenses exports it).', tab: 'licenses' },
  { name: 'Chain of title', group: 'legal', notes: 'Proof you own the story: script, rights options, writer agreements.' },
  { name: 'E&O insurance certificate', group: 'legal', notes: 'Errors & omissions insurance; distributors usually require it before release.' },
  { name: 'Clearance report', group: 'legal', notes: 'Logos, artwork, locations and names checked and cleared (Plan → Paperwork makes one from the script).', tab: 'paperwork' },
  { name: 'Signed releases and contracts', group: 'legal', notes: 'Cast, crew, locations and music: copies of every signed agreement.', tab: 'paperwork' },
  { name: 'Credits list (spelling checked)', group: 'legal', notes: 'Exports → End credits makes a list to check with everyone.', tab: 'reports' },
  { name: 'Poster / key art', group: 'marketing', notes: 'High-resolution, with and without text.', tab: 'presskit' },
  { name: 'Trailer', group: 'marketing', notes: 'Usually 1–2 minutes. Check your music licences cover trailers.' },
  { name: 'Production stills', group: 'marketing', notes: 'High-resolution, captioned, with releases from everyone in them.', tab: 'presskit' },
  { name: 'Press kit (EPK)', group: 'marketing', notes: 'Release → Press kit makes it.', tab: 'presskit' },
  { name: 'Laurels', group: 'marketing', notes: 'The official laurel files from each festival (PNG/SVG, light and dark), kept in Release → Press kit → Laurels.', tab: 'presskit' },
];

export const newDeliverable = (patch: Partial<Deliverable> = {}): Deliverable => ({ id: newId(), name: '', group: 'other', status: 'todo', ...patch });
/** The template items not on the list yet. */
export const missingDeliverables = (list: Deliverable[]) => DELIVERABLE_TEMPLATE.filter((t) => !list.some((d) => d.name.toLowerCase() === t.name.toLowerCase()))
  .map((t) => newDeliverable({ name: t.name, group: t.group, notes: t.notes }));
export const deliverableTab = (d: Deliverable) => DELIVERABLE_TEMPLATE.find((t) => t.name === d.name)?.tab;

export const OUTLET_KINDS: { id: OutletKind; label: string; hint: string }[] = [
  { id: 'sales-agent', label: 'Sales agent', hint: 'Sells the film to distributors in many countries' },
  { id: 'distributor', label: 'Distributor', hint: 'Releases it in a territory (cinemas, TV, online)' },
  { id: 'platform', label: 'Streaming platform', hint: 'A streamer or curated platform that licenses films' },
  { id: 'aggregator', label: 'Aggregator', hint: 'Delivers your film to stores and platforms for a fee' },
  { id: 'broadcaster', label: 'Broadcaster', hint: 'TV channels, often for shorts programmes' },
  { id: 'self', label: 'Self-release', hint: 'You put it out yourself: Vimeo on Demand, YouTube, your site' },
  { id: 'other', label: 'Other', hint: '' },
];
export const OUTLET_STATUSES: { id: OutletStatus; label: string }[] = [
  { id: 'researching', label: 'Researching' }, { id: 'contacted', label: 'Contacted' }, { id: 'talking', label: 'In talks' },
  { id: 'offer', label: 'Offer' }, { id: 'signed', label: 'Signed' }, { id: 'passed', label: 'Passed' },
];
export const RIGHTS: { id: ReleaseRight; label: string }[] = [
  { id: 'festival', label: 'Festivals' }, { id: 'theatrical', label: 'Cinemas' }, { id: 'streaming', label: 'Streaming' }, { id: 'online', label: 'Online video' },
  { id: 'tv', label: 'TV' }, { id: 'educational', label: 'Educational' }, { id: 'airline', label: 'Airlines' }, { id: 'trailer', label: 'Trailer & promo' },
];
export const newOutlet = (patch: Partial<Outlet> = {}): Outlet => ({ id: newId(), name: '', kind: 'distributor', status: 'researching', rights: ['streaming'], ...patch });

// ---------------------------------------------------------------- licence scope

/** What a licence's media line covers. Unknown wording covers nothing we can be sure of. */
export function licenceCovers(l: Pick<License, 'media'>): Set<ReleaseRight> | 'all' {
  const m = (l.media ?? '').toLowerCase();
  if (/all media|any media|worldwide all|in perpetuity.*all|all rights/.test(m)) return 'all';
  const out = new Set<ReleaseRight>();
  if (/festival/.test(m)) out.add('festival');
  if (/stream|online|internet|web|vod|svod|avod/.test(m)) { out.add('streaming'); out.add('online'); }
  if (/broadcast|\btv\b|television/.test(m)) out.add('tv');
  if (/theatr|cinema/.test(m)) out.add('theatrical');
  if (/education/.test(m)) out.add('educational');
  if (/airline|in-flight|inflight/.test(m)) out.add('airline');
  if (/trailer|promo|advertis|in-context/.test(m)) out.add('trailer');
  return out;
}

/** Where the film is planned to go: festivals on the list, plus outlets you're talking to or signed with. */
export function plannedRights(p: Pick<Project, 'festivals' | 'budget' | 'outlets'>): Map<ReleaseRight, string[]> {
  const out = new Map<ReleaseRight, string[]>();
  const add = (r: ReleaseRight, why: string) => out.set(r, [...(out.get(r) ?? []), why]);
  if (joinFestivals(p).some((f) => f.status !== 'withdrawn' && f.status !== 'declined')) add('festival', 'your festival list');
  for (const o of p.outlets ?? []) if (o.status !== 'passed') for (const r of o.rights) add(r, o.name || 'an outlet');
  return out;
}

export interface ScopeWarning { licenceId: string; title: string; text: string }

/**
 * Licences that don't cover where the film is going: music cleared for festivals isn't cleared
 * for streaming or trailers, and a licence can run out before a release date.
 */
export function scopeWarnings(p: Pick<Project, 'festivals' | 'budget' | 'outlets'>): ScopeWarning[] {
  const need = plannedRights(p);
  const out: ScopeWarning[] = [];
  const label = (r: ReleaseRight) => RIGHTS.find((x) => x.id === r)!.label.toLowerCase();
  for (const l of p.budget.licenses ?? []) {
    if (l.status === 'declined') continue;
    const title = l.title || 'A licence';
    const cov = licenceCovers(l);
    if (cov !== 'all') {
      const gaps = [...need.keys()].filter((r) => !cov.has(r));
      if (gaps.length) out.push({ licenceId: l.id, title, text: `${title} (${l.media?.trim() || 'media not set'}) doesn’t cover ${gaps.map(label).join(', ')}, which ${gaps.length === 1 ? 'is' : 'are'} planned (${[...new Set(gaps.flatMap((g) => need.get(g)!))].join(', ')}).` });
    }
    if (l.expires) {
      const late = (p.outlets ?? []).filter((o) => o.status !== 'passed' && o.releaseDate && o.releaseDate > l.expires!);
      if (late.length) out.push({ licenceId: l.id, title, text: `${title} expires ${l.expires}, before the release with ${late.map((o) => o.name || 'an outlet').join(', ')} (${late[0].releaseDate}).` });
    }
  }
  return out;
}
