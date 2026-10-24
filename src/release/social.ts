import type { Project, SocialPlatform, SocialPost, SocialStatus } from '../model/types';
import { newId } from '../model/ids';
import { addDays } from '../model/dates';
import { marketingAnchors } from '../plan/marketingTasks';
import { joinFestivals } from '../budget/festivals';
import { docsFor, isDone, people, type Person } from '../paperwork/paperwork';

// Release → Social & BTS: a content calendar tied to the production's milestones, the photos and
// clips for each post, and a check that everyone shown has signed a release.

export const PLATFORMS: { id: SocialPlatform; label: string }[] = [
  { id: 'instagram', label: 'Instagram' }, { id: 'tiktok', label: 'TikTok' }, { id: 'youtube', label: 'YouTube' }, { id: 'x', label: 'X' },
  { id: 'facebook', label: 'Facebook' }, { id: 'bluesky', label: 'Bluesky' }, { id: 'threads', label: 'Threads' }, { id: 'linkedin', label: 'LinkedIn' }, { id: 'other', label: 'Other' },
];
export const SOCIAL_STATUSES: { id: SocialStatus; label: string }[] = [
  { id: 'idea', label: 'Idea' }, { id: 'drafted', label: 'Drafted' }, { id: 'scheduled', label: 'Scheduled' }, { id: 'posted', label: 'Posted' },
];
export const MILESTONES = ['Announcement', 'Casting announced', 'Prep / location scout', 'First shoot day', 'Behind the scenes', 'Wrap', 'Picture lock', 'Poster reveal', 'Trailer', 'Festival news', 'Premiere', 'Release'];

export const newPost = (patch: Partial<SocialPost> = {}): SocialPost => ({ id: newId(), platforms: ['instagram'], caption: '', mediaIds: [], people: [], status: 'idea', ...patch });

/** Post ideas for the production's milestones (shoot dates from the Stripboard, festival news from Festivals). */
export function milestonePosts(p: Project): SocialPost[] {
  const { shoot, lock } = marketingAnchors(p);
  const days = p.schedule.days.filter((d) => d.items.some((i) => i.kind === 'scene')).map((d) => d.date).sort();
  const wrap = days[days.length - 1] ?? addDays(shoot, 3);
  const out: SocialPost[] = [
    newPost({ date: addDays(shoot, -42), milestone: 'Announcement', caption: `We’re making a film: ${p.titlePage.title || p.title}. More soon.` }),
    newPost({ date: addDays(shoot, -21), milestone: 'Casting announced', caption: 'Meet the cast.' }),
    newPost({ date: shoot, milestone: 'First shoot day', caption: 'Day 1. Here we go.' }),
    ...days.slice(1, -1).map((d, i) => newPost({ date: d, milestone: 'Behind the scenes', caption: `Day ${i + 2} behind the scenes.` })),
    newPost({ date: wrap, milestone: 'Wrap', caption: 'That’s a wrap. Thank you to everyone on this crew.' }),
    newPost({ date: lock, milestone: 'Picture lock', caption: 'Picture lock.' }),
    newPost({ date: addDays(lock, 14), milestone: 'Poster reveal', caption: 'The poster.' }),
  ];
  for (const f of joinFestivals(p).filter((x) => x.status === 'accepted')) {
    out.push(newPost({ date: f.notifyDate ?? f.eventStart, milestone: 'Festival news', caption: `${f.laurel || 'Official Selection'}: ${f.name.replace(/\s*\(fictional\)\s*$/i, '')}${f.eventStart ? ` (${f.eventStart.slice(0, 4)})` : ''}.` }));
  }
  return out;
}

/** The milestone ideas not on the calendar yet (one per milestone and date). */
export function missingMilestonePosts(p: Project): SocialPost[] {
  const have = new Set((p.socialPosts ?? []).map((x) => `${x.milestone}|${x.date}`));
  return milestonePosts(p).filter((x) => !have.has(`${x.milestone}|${x.date}`));
}

/** Everyone who can be tagged in a post. */
export const taggable = (p: Project): Person[] => people(p, { contacts: true });

/**
 * People shown in a post without a signed release (talent, crew, appearance or minor's release),
 * when the paperwork can be seen. `null` when it can't (paperwork is kept with the budget).
 */
export function unreleased(p: Project, post: Pick<SocialPost, 'people'>, seesPaperwork: boolean): Person[] | null {
  if (!seesPaperwork) return null;
  const all = taggable(p);
  return post.people.map((k) => all.find((x) => x.key === k)).filter((x): x is Person => !!x)
    .filter((x) => !docsFor(p, x.ref).some((d) => (d.kind === 'talent' || d.kind === 'crew' || d.kind === 'appearance' || d.kind === 'minor') && isDone(d)));
}
