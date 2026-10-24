import type { SocialPlatform, SocialPost } from '../model/types';
import { PLATFORMS } from './social';

// Getting a prepared post out without Open Gate holding anyone's logins: compose links that open
// the platform with the caption filled in, caption limits, and a calendar export for scheduling
// tools. Checked online 2026-10-24:
// - X: https://x.com/intent/tweet?text= (docs.x.com, "Web Intent"); 280 characters.
// - Threads: https://www.threads.com/intent/post?text= (developers.facebook.com, "Threads Web Intents"); 500.
// - Bluesky: https://bsky.app/intent/compose?text= (docs.bsky.app, "Intent links"); 300 graphemes.
// - Facebook and LinkedIn have no supported way to fill in text from a link: copy the caption and open the site.
// - Limits: Instagram 2,200; LinkedIn 3,000; YouTube description 5,000; TikTok 2,200 (more in some
//   accounts' apps); Facebook about 63,206 (widely reported, not published by Meta).
// - Buffer bulk upload: headers "Text", "Image URL", "Tags", "Posting Time" (YYYY-MM-DD HH:mm), from
//   support.buffer.com. Hootsuite's and Later's formats weren't confirmed from their own docs, so they
//   get the general CSV.

export const CAPTION_LIMITS: Partial<Record<SocialPlatform, number>> = {
  x: 280, bluesky: 300, threads: 500, instagram: 2200, tiktok: 2200, linkedin: 3000, youtube: 5000, facebook: 63206,
};

/** Characters as people see them (an emoji counts once), as Bluesky counts. */
export function captionLength(text: string): number {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (t: string) => Iterable<unknown> } }).Segmenter;
  try { return Seg ? [...new Seg(undefined, { granularity: 'grapheme' }).segment(text)].length : [...text].length; } catch { return [...text].length; }
}

/** Platforms the caption is too long for. */
export function overLimits(post: Pick<SocialPost, 'caption' | 'platforms'>): { platform: SocialPlatform; label: string; limit: number; length: number }[] {
  const n = captionLength(post.caption);
  return post.platforms.flatMap((pl) => {
    const limit = CAPTION_LIMITS[pl];
    return limit && n > limit ? [{ platform: pl, label: PLATFORMS.find((x) => x.id === pl)?.label ?? pl, limit, length: n }] : [];
  });
}

/** A compose page with the caption filled in, where the platform supports it. */
export function composeUrl(platform: SocialPlatform, caption: string): string | undefined {
  const t = encodeURIComponent(caption);
  switch (platform) {
    case 'x': return `https://x.com/intent/tweet?text=${t}`;
    case 'threads': return `https://www.threads.com/intent/post?text=${t}`;
    case 'bluesky': return `https://bsky.app/intent/compose?text=${t}`;
    default: return undefined;
  }
}

/** Where to paste the caption on platforms that can't be filled in from a link. */
export const SITE_URL: Partial<Record<SocialPlatform, string>> = {
  facebook: 'https://www.facebook.com/', linkedin: 'https://www.linkedin.com/feed/', instagram: 'https://www.instagram.com/',
  tiktok: 'https://www.tiktok.com/upload', youtube: 'https://studio.youtube.com/',
};

// ---------------------------------------------------------------- calendar export

const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const row = (xs: string[]) => xs.map(cell).join(',');

export interface MediaName { id: string; name: string }

/** The general calendar: date, time, platforms, milestone, caption, media file names, status, link. */
export function calendarCsv(posts: SocialPost[], media: (id: string) => string | undefined, time = '10:00'): string {
  const lines = [row(['Date', 'Time', 'Platforms', 'Milestone', 'Caption', 'Media files', 'Status', 'Link'])];
  for (const x of [...posts].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))) {
    lines.push(row([x.date ?? '', x.date ? time : '', x.platforms.map((pl) => PLATFORMS.find((y) => y.id === pl)?.label ?? pl).join('; '), x.milestone ?? '', x.caption, x.mediaIds.map(media).filter(Boolean).join('; '), x.status, x.url ?? '']));
  }
  return lines.join('\r\n') + '\r\n';
}

/** Buffer's bulk upload: Text, Image URL (left empty: your media isn't online), Tags, Posting Time. */
export function bufferCsv(posts: SocialPost[], time = '10:00'): string {
  const lines = [row(['Text', 'Image URL', 'Tags', 'Posting Time'])];
  for (const x of posts.filter((p) => p.status !== 'posted' && p.caption.trim())) lines.push(row([x.caption, '', x.milestone ?? '', x.date ? `${x.date} ${time}` : '']));
  return lines.join('\r\n') + '\r\n';
}
