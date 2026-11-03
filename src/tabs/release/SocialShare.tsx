import { useState } from 'react';
import JSZip from 'jszip';
import type { SocialPost } from '../../model/types';
import { useProject } from '../../store/project';
import { getMedia } from '../../store/media';
import { download, safeName } from '../../io/files';
import { mediaExt, socialCalendarFiles } from '../../io/exports';
import { PLATFORMS } from '../../release/social';
import { SITE_URL, composeUrl } from '../../release/socialShare';
import type { Person } from '../../paperwork/paperwork';
import { askConfirm } from '../../components/dialogs';
import { toast } from '../../components/common';

// Share a prepared post: the phone's share sheet, compose pages filled in, copy and download.
// Open Gate never signs in to a platform; the platform's own app or site publishes the post.


async function files(post: SocialPost): Promise<File[]> {
  const out: File[] = [];
  let i = 1;
  for (const id of post.mediaIds) {
    const b = await getMedia(id);
    if (b) out.push(new File([b], `${safeName(post.milestone || 'post')} ${i++}.${mediaExt(b.type)}`, { type: b.type }));
  }
  return out;
}

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function ShareBar({ post, missing, onShared }: { post: SocialPost; missing: Person[] | null; onShared: () => void }) {
  const [busy, setBusy] = useState(false);
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;
  // Anyone shown without a signed release: ask first.
  const okToShare = async () => !missing?.length || askConfirm('Share it anyway?', { message: `${missing.map((m) => m.name).join(', ')} ${missing.length === 1 ? 'hasn’t' : 'haven’t'} signed a release. Get one before this goes up.`, confirmLabel: 'Share anyway', danger: true });
  const share = async () => {
    if (!(await okToShare())) return;
    setBusy(true);
    try {
      const copied = post.caption ? await copy(post.caption) : false;
      const fs = await files(post);
      const data: ShareData = { text: post.caption, files: fs.length && navigator.canShare?.({ files: fs }) ? fs : undefined };
      await navigator.share(data);
      if (copied) toast('Caption copied: paste it in if the app didn’t take it.');
      onShared();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast(`Couldn’t share: ${(e as Error).message}`);
    } finally { setBusy(false); }
  };
  const open = async (pl: SocialPost['platforms'][number]) => {
    if (!(await okToShare())) return;
    const url = composeUrl(pl, post.caption);
    if (url) { window.open(url, '_blank', 'noopener'); onShared(); return; }
    const copied = await copy(post.caption);
    window.open(SITE_URL[pl]!, '_blank', 'noopener');
    toast(copied ? 'Caption copied: paste it into the post.' : 'Copy the caption first (your browser didn’t allow it).');
    onShared();
  };
  const saveMedia = async () => {
    const fs = await files(post);
    if (!fs.length) { toast('No photos or clips on this post yet.'); return; }
    if (fs.length === 1) { download(fs[0].name, fs[0]); return; }
    const z = new JSZip();
    for (const f of fs) z.file(f.name, f);
    download(`${safeName(post.milestone || 'post')} media.zip`, await z.generateAsync({ type: 'blob' }));
  };
  const linkable = post.platforms.filter((pl) => composeUrl(pl, '') || SITE_URL[pl]);
  const appOnly = post.platforms.filter((pl) => pl === 'instagram' || pl === 'tiktok');
  return (
    <div className="share-bar">
      <div className="row wrap">
        {canShare && <button className="small primary" disabled={busy} onClick={() => void share()} title="Your device's share sheet: photos and caption to Instagram, TikTok, Threads…">Share…</button>}
        {linkable.map((pl) => {
          const label = PLATFORMS.find((x) => x.id === pl)?.label ?? pl;
          return <button key={pl} className="small" onClick={() => void open(pl)} title={composeUrl(pl, '') ? `Opens ${label} with the caption filled in` : `Copies the caption and opens ${label}`}>{composeUrl(pl, '') ? `Post to ${label}` : `Open ${label}`} ↗</button>;
        })}
        <button className="small" onClick={() => void copy(post.caption).then((ok) => toast(ok ? 'Caption copied.' : 'Your browser didn’t allow copying.'))} disabled={!post.caption}>Copy caption</button>
        <button className="small" onClick={() => void saveMedia()} disabled={!post.mediaIds.length}>Download media</button>
      </div>
      {appOnly.length > 0 && <span className="muted small">{appOnly.map((pl) => PLATFORMS.find((x) => x.id === pl)!.label).join(' and ')} can’t be filled in from a link: {canShare ? 'use Share… (easiest on your phone), or ' : ''}download the media and copy the caption, then post in the app or on the website.</span>}
    </div>
  );
}

/** The calendar for scheduling tools: a general CSV, a Buffer CSV and the media, in one ZIP. */
export function ExportCalendar({ posts }: { posts: SocialPost[] }) {
  const p = useProject();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const z = new JSZip();
      for (const f of await socialCalendarFiles(posts)) z.file(f.path, f.data);
      download(`${safeName(p.title)} social calendar.zip`, await z.generateAsync({ type: 'blob' }));
    } catch (e) { toast((e as Error).message); } finally { setBusy(false); }
  };
  return <button disabled={busy} onClick={() => void run()} title="A CSV of the calendar (plus one for Buffer) and the media, for scheduling tools">Export calendar…</button>;
}

/** A month's stats, when any were typed in. */
export function monthStats(list: SocialPost[]) {
  const sum = (k: 'views' | 'likes' | 'comments') => list.reduce((a, x) => a + (x.stats?.[k] ?? 0), 0);
  const v = sum('views'), l = sum('likes'), c = sum('comments');
  if (!v && !l && !c) return null;
  return <span className="muted small social-month-stats"> · {v ? `${v.toLocaleString()} views` : ''}{l ? ` · ${l.toLocaleString()} likes` : ''}{c ? ` · ${c.toLocaleString()} comments` : ''}</span>;
}
