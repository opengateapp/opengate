import { useMemo, useState } from 'react';
import { todayISO } from '../../model/dates';
import { ShareBar, ExportCalendar, monthStats } from './SocialShare';
import { NumberInput } from '../../components/NumberInput';
import { overLimits } from '../../release/socialShare';
import type { SocialPlatform, SocialPost, SocialStatus } from '../../model/types';
import { useProject, useStore } from '../../store/project';
import { putMedia, useMediaUrl } from '../../store/media';
import { canEdit, useSync } from '../../sync/state';
import { formatDate } from '../../model/dates';
import { prepareImage } from '../storyboard/images';
import { useNarrow } from '../../ui/responsive';
import { MILESTONES, PLATFORMS, SOCIAL_STATUSES, missingMilestonePosts, newPost, taggable, unreleased } from '../../release/social';
import { toast } from '../../components/common';
import { deletedToast } from '../../components/deleted';
import { Hint } from '../../components/Hint';
import { RefLink } from '../ReferenceTab';

// Release → Social & BTS: a content calendar tied to milestones, the photos and clips for each
// post, and who's in them (each needs a signed release). Posts dated on a shoot day show on that
// day's call sheet in a "BTS & stills" section.

const goto = (tab: string) => window.dispatchEvent(new CustomEvent('opengate:goto', { detail: tab }));
const media = (files: FileList | File[] | null | undefined) => [...(files ?? [])].filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
const MAX_CLIP = 25_000_000;

export function SocialTab() {
  const p = useProject();
  const update = useStore((s) => s.update);
  useSync((s) => s.write);
  const seesPaperwork = useSync((s) => s.write === null || s.admin || s.budget);
  const ro = !canEdit('socialPosts');
  const [show, setShow] = useState<SocialStatus | ''>('');
  const posts = p.socialPosts ?? [];
  const shown = useMemo(() => posts.filter((x) => !show || x.status === show).slice().sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999')), [posts, show]);
  const ideas = useMemo(() => missingMilestonePosts(p), [p]);
  const narrow = useNarrow();
  const [sel, setSel] = useState<string | null>(null);
  const shootDates = useMemo(() => new Set(p.schedule.days.filter((d) => d.items.some((i) => i.kind === 'scene')).map((d) => d.date)), [p.schedule.days]);

  const edit = (fn: (l: SocialPost[]) => void, label: string | null = 'Edit social posts') => update((dr) => { dr.socialPosts ??= []; fn(dr.socialPosts as SocialPost[]); }, label);
  const set = (id: string, patch: Partial<SocialPost>, label: string | null = null) => edit((l) => { const x = l.find((y) => y.id === id); if (x) Object.assign(x, patch); }, label);
  const add = () => { const x = newPost(); edit((l) => { l.push(x); }, 'Add post'); setSel(x.id); };
  const addMedia = async (id: string, files: File[]) => {
    if (ro || !files.length) return;
    const ids: string[] = [];
    for (const f of files) {
      try {
        if (f.type.startsWith('video/') && f.size > MAX_CLIP) { toast(`${f.name} is too big to keep with the project (25 MB at most).`); continue; }
        ids.push(await putMedia(p.id, f.type.startsWith('image/') ? await prepareImage(f) : f));
      } catch (e) { toast((e as Error).message); }
    }
    if (ids.length) edit((l) => { const x = l.find((y) => y.id === id); if (x) x.mediaIds.push(...ids); }, 'Add photos');
  };

  // Group by month for the calendar.
  const groups = new Map<string, SocialPost[]>();
  for (const x of shown) { const k = x.date ? x.date.slice(0, 7) : 'none'; groups.set(k, [...(groups.get(k) ?? []), x]); }

  return (
    <div className="social-tab pad scroll" onDoubleClick={(e) => { if (!ro && (e.target as HTMLElement).classList.contains('social-list')) add(); }}>
      <div className="toolbar flat wrap">
        <h3>Social & BTS</h3>
        {!ro && <button className="primary" onClick={add}>＋ Post</button>}
        {!ro && ideas.length > 0 && <button onClick={() => edit((l) => { l.push(...ideas); }, 'Add milestone posts')} title={ideas.map((x) => `${x.milestone} ${x.date ?? ''}`).join('\n')}>Add {ideas.length} milestone idea{ideas.length === 1 ? '' : 's'}</button>}
        <RefLink page="marketing" label="Marketing your film" />
        <span className="spacer" />
        {posts.length > 0 && <ExportCalendar posts={posts} />}
        <label className="check small">Show
          <select value={show} onChange={(e) => setShow(e.target.value as SocialStatus | '')}><option value="">Every post</option>{SOCIAL_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        </label>
      </div>
      <p className="muted small"><Hint>{'Plan posts around the production: casting, first day, wrap, picture lock, the poster, festival news. Posts dated on a shoot day show up on that day’s call sheet (add a “BTS & stills” section) so someone gets the photo.'}</Hint></p>

      {!narrow && posts.length > 0 ? (() => {
        const cur = shown.find((x) => x.id === sel) ?? shown[0];
        return (
          <div className="social-split">
            <div className="social-rows" role="listbox" aria-label="Posts">
              {[...groups].map(([month, list]) => (
                <section key={month}>
                  <h4>{month === 'none' ? 'No date yet' : formatDate(`${month}-01`, { month: 'long', year: 'numeric' })}{monthStats(list)}</h4>
                  {list.map((x) => <PostRow key={x.id} post={x} on={x.id === cur?.id} shootDay={!!x.date && shootDates.has(x.date)} seesPaperwork={seesPaperwork} pick={() => setSel(x.id)} />)}
                </section>
              ))}
              {!ro && <button className="social-row-add" onClick={add} onDoubleClick={(e) => e.stopPropagation()}>＋ Post</button>}
            </div>
            <div className="social-editor">
              {cur ? <PostCard key={cur.id} post={cur} ro={ro} shootDay={!!cur.date && shootDates.has(cur.date)} seesPaperwork={seesPaperwork}
                set={(patch, label) => set(cur.id, patch, label)}
                addMedia={(f) => void addMedia(cur.id, f)}
                remove={() => { const i = shown.findIndex((y) => y.id === cur.id); setSel(shown[i + 1]?.id ?? shown[i - 1]?.id ?? null); edit((l) => { const k = l.findIndex((y) => y.id === cur.id); if (k >= 0) l.splice(k, 1); }, 'Delete post'); deletedToast('post'); }} />
                : <p className="muted">No posts with that status.</p>}
            </div>
          </div>
        );
      })() : (
      <div className="social-list">
        {!posts.length && <p className="muted pad"><Hint>{'No posts yet. “Add milestone ideas” starts a calendar from your schedule and festivals; or double-click here to add one.'}</Hint></p>}
        {[...groups].map(([month, list]) => (
          <section key={month}>
            <h4>{month === 'none' ? 'No date yet' : formatDate(`${month}-01`, { month: 'long', year: 'numeric' })}{monthStats(list)}</h4>
            {list.map((x) => (
              <PostCard key={x.id} post={x} ro={ro} shootDay={!!x.date && shootDates.has(x.date)} seesPaperwork={seesPaperwork}
                set={(patch, label) => set(x.id, patch, label)}
                addMedia={(f) => void addMedia(x.id, f)}
                remove={() => { edit((l) => { const i = l.findIndex((y) => y.id === x.id); if (i >= 0) l.splice(i, 1); }, 'Delete post'); deletedToast('post'); }} />
            ))}
          </section>
        ))}
      </div>
      )}
    </div>
  );
}

const PLATFORM_SHORT: Record<SocialPlatform, string> = { instagram: 'IG', tiktok: 'TT', youtube: 'YT', x: 'X', facebook: 'FB', bluesky: 'BS', threads: 'TH', linkedin: 'LI', other: '…' };

/** Desktop: one compact row per post; click (or double-click) to edit it on the right. */
function PostRow({ post: x, on, shootDay, seesPaperwork, pick }: { post: SocialPost; on: boolean; shootDay: boolean; seesPaperwork: boolean; pick: () => void }) {
  const p = useProject();
  const missing = unreleased(p, x, seesPaperwork);
  return (
    <button role="option" aria-selected={on} className={`social-row st-${x.status} ${on ? 'on' : ''}`} onClick={pick} onDoubleClick={() => { pick(); setTimeout(() => (document.querySelector('.social-editor textarea') as HTMLTextAreaElement | null)?.focus(), 0); }}>
      <span className="social-row-date">{x.date ? formatDate(x.date, { month: 'short', day: 'numeric' }) : '—'}{shootDay && <span title="Shoot day"> 🎬</span>}</span>
      <span className="social-row-main"><b>{x.milestone || 'Post'}</b><span className="muted small">{x.caption.split('\n')[0] || 'No caption yet'}</span></span>
      <span className="social-row-pl muted small">{x.platforms.map((pl) => PLATFORM_SHORT[pl]).join(' ')}</span>
      {x.mediaIds.length > 0 && <span className="muted small">🖼 {x.mediaIds.length}</span>}
      {missing && missing.length > 0 && <span className="warn small" title={`No signed release: ${missing.map((m) => m.name).join(', ')}`}>⚠</span>}
      <span className={`doc-status s-${x.status} small`}>{SOCIAL_STATUSES.find((s) => s.id === x.status)?.label}</span>
    </button>
  );
}

function PostCard({ post: x, ro, shootDay, seesPaperwork, set, addMedia, remove }: {
  post: SocialPost; ro: boolean; shootDay: boolean; seesPaperwork: boolean;
  set: (patch: Partial<SocialPost>, label?: string | null) => void; addMedia: (f: File[]) => void; remove: () => void;
}) {
  const p = useProject();
  const all = useMemo(() => taggable(p), [p]);
  const missing = unreleased(p, x, seesPaperwork);
  const over = overLimits(x);
  const [ask, setAsk] = useState(false);
  const shared = () => { if (x.status !== 'posted') setAsk(true); };
  return (
    <article className={`social-card st-${x.status}`} onDragOver={(e) => { if (!ro && e.dataTransfer.types.includes('Files')) e.preventDefault(); }} onDrop={(e) => { if (ro) return; e.preventDefault(); addMedia(media(e.dataTransfer.files)); }}>
      <div className="row wrap">
        <input disabled={ro} type="date" value={x.date ?? ''} aria-label="Date" onChange={(e) => set({ date: e.target.value || undefined })} />
        {shootDay && <span className="chip small" title="On this day’s call sheet (BTS & stills section)">🎬 shoot day</span>}
        <input disabled={ro} className="social-milestone" list="social-milestones" value={x.milestone ?? ''} placeholder="Milestone" aria-label="Milestone" onChange={(e) => set({ milestone: e.target.value || undefined })} />
        <select disabled={ro} value={x.status} aria-label="Status" className={`doc-status s-${x.status}`} onChange={(e) => set({ status: e.target.value as SocialStatus }, 'Post status')}>{SOCIAL_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <span className="spacer" />
        {!ro && <button className="icon-btn" aria-label="Delete post" onClick={remove}>×</button>}
      </div>
      <div className="rights" role="group" aria-label="Platforms">
        {PLATFORMS.map((pl) => <label key={pl.id} className={`chip small ${x.platforms.includes(pl.id) ? 'on' : ''}`}><input disabled={ro} type="checkbox" hidden checked={x.platforms.includes(pl.id)} onChange={(e) => set({ platforms: e.target.checked ? [...x.platforms, pl.id] : x.platforms.filter((y) => y !== pl.id) as SocialPlatform[] })} />{pl.label}</label>)}
      </div>
      <textarea disabled={ro} rows={3} value={x.caption} placeholder="Caption" aria-label="Caption" onChange={(e) => set({ caption: e.target.value })} />
      {over.map((o) => <span key={o.platform} className="small warn">{o.length} characters: {o.label} allows {o.limit.toLocaleString()}.</span>)}
      <ShareBar post={x} missing={missing} onShared={shared} />
      {ask && !ro && (
        <div className="social-ask row wrap" role="status">
          <span className="small">Did it go up?</span>
          <button className="small primary" onClick={() => { set({ status: 'posted', date: x.date ?? todayISO() }, 'Mark posted'); setAsk(false); }}>Mark posted{x.date ? '' : ' today'}</button>
          <button className="small" onClick={() => setAsk(false)}>Not yet</button>
        </div>
      )}
      <div className="social-media">
        {x.mediaIds.map((id, i) => <Thumb key={id} id={id} ro={ro} onRemove={() => set({ mediaIds: x.mediaIds.filter((_, k) => k !== i) }, 'Remove photo')} />)}
        {!ro && <label className="social-add" title="Add photos or clips (or drop them on the post)">＋<input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { addMedia(media(e.target.files)); e.target.value = ''; }} /></label>}
        {!ro && (p.pressKit?.stills.length ?? 0) > 0 && <button className="small" onClick={() => set({ mediaIds: [...new Set([...x.mediaIds, ...p.pressKit!.stills])] }, 'Add press stills')} title="Add the press kit’s stills">＋ Press stills</button>}
        {!ro && (p.pressKit?.laurels ?? []).some((l) => l.include && l.imageId) && <button className="small" onClick={() => set({ mediaIds: [...new Set([...x.mediaIds, ...p.pressKit!.laurels!.filter((l) => l.include && l.imageId).map((l) => l.imageId!)])] }, 'Add laurels')} title="Add the laurel images from the press kit">＋ Laurels</button>}
      </div>
      <div className="row wrap social-people">
        <span className="muted small">In it:</span>
        {x.people.map((k) => { const who = all.find((y) => y.key === k); return <span key={k} className={`chip small ${missing?.some((m) => m.key === k) ? 'warn-chip' : ''}`}>{who?.name ?? 'Someone'}{!ro && <button className="icon-btn" aria-label={`Remove ${who?.name ?? 'person'}`} onClick={() => set({ people: x.people.filter((y) => y !== k) })}>×</button>}</span>; })}
        {!ro && (
          <select value="" aria-label="Add a person" onChange={(e) => { if (e.target.value) set({ people: [...x.people, e.target.value] }, 'Tag person'); }}>
            <option value="">＋ Person</option>
            {(['Cast', 'Crew', 'Contact'] as const).map((g) => <optgroup key={g} label={g}>{all.filter((y) => y.group === g && !x.people.includes(y.key)).map((y) => <option key={y.key} value={y.key}>{y.name}</option>)}</optgroup>)}
          </select>
        )}
      </div>
      {missing && missing.length > 0 && <p className="fund-warn small">No signed release for {missing.map((m) => m.name).join(', ')}. Get one before this goes up. <button className="link small" onClick={() => goto('paperwork')}>Paperwork</button></p>}
      {missing === null && x.people.length > 0 && <p className="muted small">Releases are kept with the paperwork (budget access): check them before posting.</p>}
      {x.status === 'posted' && (
        <div className="social-stats row wrap">
          {(['views', 'likes', 'comments'] as const).map((k) => (
            <label key={k} className="check small">{{ views: 'Views', likes: 'Likes', comments: 'Comments' }[k]} <NumberInput className="cell-num small" disabled={ro} min={0} decimals={0} value={x.stats?.[k]} aria-label={k} onChange={(n) => set({ stats: { ...x.stats, [k]: n } })} /></label>
          ))}
          <span className="muted small">typed in from the platform</span>
        </div>
      )}
      {x.status === 'posted' && <input disabled={ro} value={x.url ?? ''} placeholder="Link to the post" aria-label="Link to the post" onChange={(e) => set({ url: e.target.value || undefined })} />}
      <datalist id="social-milestones">{MILESTONES.map((m) => <option key={m} value={m} />)}</datalist>
    </article>
  );
}

function Thumb({ id, ro, onRemove }: { id: string; ro: boolean; onRemove: () => void }) {
  const url = useMediaUrl(id);
  return (
    <figure className="social-thumb">
      {url ? <img src={url} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <span className="muted small">…</span>}
      {!ro && <button className="icon-btn" aria-label="Remove" onClick={onRemove}>×</button>}
    </figure>
  );
}
