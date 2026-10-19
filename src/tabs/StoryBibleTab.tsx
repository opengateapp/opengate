import { useState } from 'react';
import type { Draft } from 'immer';
import { useDerived, useProject, useStore } from '../store/project';
import type { BibleGenre, StoryBible } from '../model/types';
import { newId } from '../model/ids';
import { GENRES, RULE_PROMPTS, bibleOf, emptyBible, placeScenes, scenesByDay, suggestStoryDays } from '../bible/bible';
import { characterEntries, openCharacter } from '../script/characters';
import { canEdit, useSync } from '../sync/state';
import { deletedToast } from '../components/deleted';
import { askConfirm } from '../components/dialogs';
import { toast } from '../components/common';
import { Hint } from '../components/Hint';
import { openReference } from './ReferenceTab';

// Write → Story Bible: the world of the story. Overview, story days (which feed continuity and the
// breakdown), places linked to real shooting locations, groups, glossary and rules of the world.

type Section = 'overview' | 'days' | 'places' | 'groups' | 'glossary' | 'rules' | 'links';
const LABELS: Record<Section, string> = { overview: 'Overview', days: 'Story days', places: 'Places', groups: 'Groups & factions', glossary: 'Glossary', rules: 'Rules of the world', links: 'Characters & boards' };

export function StoryBibleTab() {
  const p = useProject();
  const update = useStore((s) => s.update);
  useSync((s) => s.write);
  const ro = !canEdit('bible');
  const b = bibleOf(p);
  const [section, setSection] = useState<Section>('overview');
  const genre = GENRES.find((g) => g.id === b.genre) ?? GENRES[0];
  const sections = (Object.keys(LABELS) as Section[]).filter((s) => s !== 'rules' || genre.rules || b.rules.length);
  const edit = (fn: (b: Draft<StoryBible>) => void, label: string | null = null) => update((d) => { d.bible = { ...emptyBible(), ...d.bible } as StoryBible; fn(d.bible as Draft<StoryBible>); }, label);

  return (
    <div className="with-side bible-tab">
      <aside className="side" data-panel="Story Bible" data-panel-pick>
        <div className="side-head"><b>Story Bible</b></div>
        {sections.map((s) => <button key={s} className={`side-link ${section === s ? 'active' : ''}`} onClick={() => setSection(s)}>{LABELS[s]}{count(b, s) ? <span className="muted small"> {count(b, s)}</span> : null}</button>)}
      </aside>
      <section className="main pad scroll bible-main">
        {section === 'overview' && <Overview b={b} ro={ro} edit={edit} />}
        {section === 'days' && <Days />}
        {section === 'places' && <Places b={b} ro={ro} edit={edit} />}
        {section === 'groups' && <Groups b={b} ro={ro} edit={edit} />}
        {section === 'glossary' && <Glossary b={b} ro={ro} edit={edit} />}
        {section === 'rules' && <Rules b={b} ro={ro} edit={edit} />}
        {section === 'links' && <Links b={b} ro={ro} edit={edit} />}
      </section>
    </div>
  );
}

const count = (b: StoryBible, s: Section) => ({ places: b.places.length, groups: b.groups.length, glossary: b.glossary.length, rules: b.rules.length } as Record<string, number>)[s] ?? 0;

type Edit = (fn: (b: Draft<StoryBible>) => void, label?: string | null) => void;

function Overview({ b, ro, edit }: { b: StoryBible; ro: boolean; edit: Edit }) {
  const [theme, setTheme] = useState('');
  return (
    <div className="bible-page">
      <h3>Overview</h3>
      <div className="field"><span>Kind of world</span>
        <div className="seg wrap">{GENRES.map((g) => <button key={g.id} disabled={ro} className={b.genre === g.id ? 'active' : ''} onClick={() => edit((x) => { x.genre = g.id as BibleGenre; }, 'Story world')}>{g.label}</button>)}</div>
        <p className="muted small">{GENRES.find((g) => g.id === b.genre)?.hint}</p>
      </div>
      <label className="field"><span>Logline — the story in one sentence</span><textarea rows={2} disabled={ro} value={b.logline} placeholder="When [something happens], a [character] must [goal] before [stakes]." onChange={(e) => edit((x) => { x.logline = e.target.value; })} /></label>
      <label className="field"><span>Synopsis</span><textarea rows={6} disabled={ro} value={b.synopsis} onChange={(e) => edit((x) => { x.synopsis = e.target.value; })} /></label>
      <label className="field"><span>Tone & style</span><textarea rows={2} disabled={ro} value={b.tone} placeholder="e.g. Warm, funny, bittersweet; handheld; saturated summer colours" onChange={(e) => edit((x) => { x.tone = e.target.value; })} /></label>
      <div className="field"><span>Themes</span>
        <div className="chips">{b.themes.map((t) => <span key={t} className="chip">{t}{!ro && <button className="icon-btn" aria-label={`Remove ${t}`} onClick={() => edit((x) => { x.themes = x.themes.filter((y) => y !== t); }, 'Remove theme')}>×</button>}</span>)}</div>
        {!ro && <input value={theme} placeholder="Add a theme, Enter" onChange={(e) => setTheme(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && theme.trim()) { const t = theme.trim(); edit((x) => { if (!x.themes.includes(t)) x.themes.push(t); }, 'Add theme'); setTheme(''); } }} />}
      </div>
      <p className="muted small">Need a structure? <button className="link small" onClick={() => openReference('frameworks')}>Reference → Story structures</button></p>
    </div>
  );
}

function Days() {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  const canSet = canEdit('sceneMeta');
  const by = scenesByDay(p, d);
  const unset = d.scenes.filter((s) => p.sceneMeta[s.id]?.storyDay == null).length;
  const setDay = (sceneId: string, day: number | undefined) => update((dr) => { const m = (dr.sceneMeta[sceneId] ??= {}); if (day == null) delete m.storyDay; else m.storyDay = day; }, 'Story day');
  const fill = () => {
    const sug = suggestStoryDays(p, d);
    update((dr) => { for (const [id, day] of sug) (dr.sceneMeta[id] ??= {}).storyDay = day; }, 'Fill story days');
    toast(`Story days set from scene headings: ${Math.max(...sug.values())} days`);
  };
  return (
    <div className="bible-page">
      <h3>Story days</h3>
      <p className="muted small"><Hint>{'Which day of the story each scene happens on. Wardrobe and hair continuity, the breakdown and call sheets use it. Drag a scene onto another day, or type the day.'}</Hint></p>
      {canSet && <div className="row wrap">{unset > 0 && <button className="primary" onClick={fill}>{unset === d.scenes.length ? 'Fill from scene headings' : `Fill the other ${unset} from headings`}</button>}
        {unset < d.scenes.length && <button onClick={async () => { if (await askConfirm('Clear every story day?', { confirmLabel: 'Clear' })) update((dr) => { for (const m of Object.values(dr.sceneMeta)) delete m.storyDay; }, 'Clear story days'); }}>Clear</button>}
      </div>}
      <div className="day-board">
        {[...by.entries()].map(([day, ids]) => (
          <div key={day} className="day-col" onDragOver={(e) => { if (canSet) e.preventDefault(); }} onDrop={(e) => { const id = e.dataTransfer.getData('application/x-opengate-scene'); if (id && day) setDay(id, day); }}>
            <h4>{day ? `Day ${day}` : 'No day yet'}<span className="muted small"> {ids.length} sc</span></h4>
            {ids.map((id) => { const s = d.sceneById.get(id)!; return (
              <div key={id} className="day-scene" draggable={canSet} onDragStart={(e) => e.dataTransfer.setData('application/x-opengate-scene', id)}>
                <b>{s.number}</b> <span className="grow">{s.heading}</span>
                <input type="number" min={1} className="cell-num" aria-label={`Story day for scene ${s.number}`} disabled={!canSet} value={p.sceneMeta[id]?.storyDay ?? ''} placeholder="–"
                  onChange={(e) => setDay(id, e.target.value ? Math.max(1, Number(e.target.value)) : undefined)} />
              </div>
            ); })}
          </div>
        ))}
        {canSet && <div className="day-col add" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { const id = e.dataTransfer.getData('application/x-opengate-scene'); if (id) setDay(id, Math.max(0, ...[...by.keys()]) + 1); }}><span className="muted small">Drop a scene here for a new day</span></div>}
      </div>
    </div>
  );
}

function ListPage<T extends { id: string }>({ title, hint, items, ro, onAdd, render, onRemove }: { title: string; hint: string; items: T[]; ro: boolean; onAdd: () => void; render: (x: T) => JSX.Element; onRemove: (x: T) => void }) {
  return (
    <div className="bible-page" onDoubleClick={(e) => { if (!ro && (e.target as HTMLElement).classList.contains('bible-page')) onAdd(); }}>
      <div className="toolbar flat"><h3>{title}</h3><span className="spacer" />{!ro && <button className="primary" onClick={onAdd}>＋ Add</button>}</div>
      <p className="muted small"><Hint>{hint}</Hint></p>
      <div className="bible-cards">
        {items.map((x) => <div key={x.id} className="card bible-card">{render(x)}{!ro && <button className="icon-btn bible-x" aria-label="Remove" onClick={() => onRemove(x)}>×</button>}</div>)}
      </div>
    </div>
  );
}

function Places({ b, ro, edit }: { b: StoryBible; ro: boolean; edit: Edit }) {
  const p = useProject();
  const d = useDerived();
  return (
    <ListPage title="Places" hint="Places in the story. Link one to a real shooting location to see its scenes and where you'll film it. Double-click empty space to add." items={b.places} ro={ro}
      onAdd={() => edit((x) => { x.places.push({ id: newId(), name: 'New place', description: '' }); }, 'Add place')}
      onRemove={(pl) => { edit((x) => { x.places = x.places.filter((y) => y.id !== pl.id); }, 'Remove place'); deletedToast(pl.name); }}
      render={(pl) => {
        const sc = placeScenes(p, d, pl);
        return (<>
          <input className="bible-title" disabled={ro} value={pl.name} onChange={(e) => edit((x) => { x.places.find((y) => y.id === pl.id)!.name = e.target.value; })} />
          <textarea rows={3} disabled={ro} value={pl.description} placeholder="What it looks, sounds and feels like; who's found there" onChange={(e) => edit((x) => { x.places.find((y) => y.id === pl.id)!.description = e.target.value; })} />
          <label className="field small"><span>Shot at (location)</span>
            <select disabled={ro} value={pl.locationId ?? ''} onChange={(e) => edit((x) => { const y = x.places.find((z) => z.id === pl.id)!; if (e.target.value) y.locationId = e.target.value; else delete y.locationId; }, 'Link location')}>
              <option value="">—</option>{p.locations.map((l) => <option key={l.id} value={l.id}>{l.realName || l.setName}</option>)}
            </select>
          </label>
          <span className="muted small">{sc.length ? `Scenes ${sc.map((id) => d.sceneById.get(id)?.number).join(', ')}` : 'No scenes yet'}</span>
        </>);
      }} />
  );
}

function Groups({ b, ro, edit }: { b: StoryBible; ro: boolean; edit: Edit }) {
  const p = useProject();
  const d = useDerived();
  const names = characterEntries(p, d).map((c) => c.name);
  return (
    <ListPage title="Groups & factions" hint="Families, crews, companies, gangs, houses — who belongs together, and what they want." items={b.groups} ro={ro}
      onAdd={() => edit((x) => { x.groups.push({ id: newId(), name: 'New group', description: '', members: [] }); }, 'Add group')}
      onRemove={(g) => { edit((x) => { x.groups = x.groups.filter((y) => y.id !== g.id); }, 'Remove group'); deletedToast(g.name); }}
      render={(g) => (<>
        <input className="bible-title" disabled={ro} value={g.name} onChange={(e) => edit((x) => { x.groups.find((y) => y.id === g.id)!.name = e.target.value; })} />
        <textarea rows={3} disabled={ro} value={g.description} placeholder="What they want, how they work" onChange={(e) => edit((x) => { x.groups.find((y) => y.id === g.id)!.description = e.target.value; })} />
        <div className="chips">{g.members.map((m) => <span key={m} className="chip"><button className="link small" onClick={() => openCharacter(m)}>{m}</button>{!ro && <button className="icon-btn" aria-label={`Remove ${m}`} onClick={() => edit((x) => { const y = x.groups.find((z) => z.id === g.id)!; y.members = y.members.filter((n) => n !== m); }, 'Remove member')}>×</button>}</span>)}</div>
        {!ro && <select value="" onChange={(e) => e.target.value && edit((x) => { x.groups.find((z) => z.id === g.id)!.members.push(e.target.value); }, 'Add member')}><option value="">＋ Member</option>{names.filter((n) => !g.members.includes(n)).map((n) => <option key={n}>{n}</option>)}</select>}
      </>)} />
  );
}

function Glossary({ b, ro, edit }: { b: StoryBible; ro: boolean; edit: Edit }) {
  const sorted = [...b.glossary].sort((x, y) => x.term.localeCompare(y.term));
  return (
    <ListPage title="Glossary" hint="Words, names and slang particular to this story — so everyone spells and says them the same way." items={sorted} ro={ro}
      onAdd={() => edit((x) => { x.glossary.push({ id: newId(), term: '', meaning: '' }); }, 'Add term')}
      onRemove={(g) => edit((x) => { x.glossary = x.glossary.filter((y) => y.id !== g.id); }, 'Remove term')}
      render={(g) => (<>
        <input className="bible-title" disabled={ro} value={g.term} placeholder="Term" onChange={(e) => edit((x) => { x.glossary.find((y) => y.id === g.id)!.term = e.target.value; })} />
        <textarea rows={2} disabled={ro} value={g.meaning} placeholder="What it means; how to say it" onChange={(e) => edit((x) => { x.glossary.find((y) => y.id === g.id)!.meaning = e.target.value; })} />
      </>)} />
  );
}

function Rules({ b, ro, edit }: { b: StoryBible; ro: boolean; edit: Edit }) {
  const prompts = RULE_PROMPTS[b.genre].filter((t) => !b.rules.some((r) => r.title === t));
  return (
    <div>
      <ListPage title="Rules of the world" hint="What's possible here and what isn't. Audiences forgive almost anything except breaking your own rules." items={b.rules} ro={ro}
        onAdd={() => edit((x) => { x.rules.push({ id: newId(), title: 'New rule', text: '' }); }, 'Add rule')}
        onRemove={(r) => edit((x) => { x.rules = x.rules.filter((y) => y.id !== r.id); }, 'Remove rule')}
        render={(r) => (<>
          <input className="bible-title" disabled={ro} value={r.title} onChange={(e) => edit((x) => { x.rules.find((y) => y.id === r.id)!.title = e.target.value; })} />
          <textarea rows={4} disabled={ro} value={r.text} onChange={(e) => edit((x) => { x.rules.find((y) => y.id === r.id)!.text = e.target.value; })} />
        </>)} />
      {!ro && prompts.length > 0 && <div className="row wrap pad-x"><span className="muted small">Ideas:</span>{prompts.map((t) => <button key={t} className="chip pick" onClick={() => edit((x) => { x.rules.push({ id: newId(), title: t, text: '' }); }, 'Add rule')}>＋ {t}</button>)}</div>}
    </div>
  );
}

function Links({ b, ro, edit }: { b: StoryBible; ro: boolean; edit: Edit }) {
  const p = useProject();
  const d = useDerived();
  const chars = characterEntries(p, d).filter((c) => c.profile || c.lines > 0);
  const go = (tab: string) => window.dispatchEvent(new CustomEvent('opengate:goto', { detail: tab }));
  return (
    <div className="bible-page">
      <h3>Characters & boards</h3>
      <h4>Characters</h4>
      <div className="chips">{chars.map((c) => <button key={c.name} className="chip pick" onClick={() => openCharacter(c.name)}>{c.name}{c.profile?.role ? ` · ${c.profile.role}` : ''}</button>)}</div>
      <p className="muted small"><button className="link small" onClick={() => go('characters')}>Relationship map →</button></p>
      <h4>Mood boards & story maps</h4>
      <div className="bible-boards">
        {p.boards.map((bd) => (
          <label key={bd.id} className="check"><input type="checkbox" disabled={ro} checked={b.boardIds.includes(bd.id)} onChange={(e) => edit((x) => { x.boardIds = e.target.checked ? [...x.boardIds, bd.id] : x.boardIds.filter((y) => y !== bd.id); }, 'Link board')} /> {bd.title} <span className="muted small">({bd.kind === 'story' ? 'story map' : bd.kind})</span></label>
        ))}
        {!p.boards.length && <p className="muted small">No boards yet.</p>}
      </div>
      <p className="muted small"><button className="link small" onClick={() => go('boards')}>Open Mood Boards →</button></p>
    </div>
  );
}

