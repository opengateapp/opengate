import type { Board, BoardItem, BoardRefKind, Project } from '../../model/types';
import type { Derived } from '../../script/derive';
import { derive } from '../../script/derive';
import { useDerived, useProject, useStore } from '../../store/project';
import { useMediaUrl } from '../../store/media';
import { characterEntries, openCharacter } from '../../script/characters';
import { bibleOf, scenesByDay } from '../../bible/bible';
import { FRAMEWORKS } from '../../reference/story';
import { kindOf } from '../../script/relationships';
import { connector, makeItem, wikiLinks } from './boardOps';

// Live cards on boards: a character, story place, scene, location or shot that always shows its
// current details and opens on double-click. Also story-map templates built from the project.

export const REF_MIME = 'application/x-opengate-ref';
export const REF_LABEL: Record<BoardRefKind, string> = { character: 'Character', place: 'Place', scene: 'Scene', location: 'Location', shot: 'Shot' };

export interface RefInfo { title: string; sub: string; imageId?: string; missing: boolean }

export function refInfo(p: Project, d: Derived, ref: NonNullable<BoardItem['ref']>): RefInfo {
  switch (ref.kind) {
    case 'character': {
      const prof = p.characters.find((c) => c.name === ref.id);
      const known = !!prof || d.characters.some((c) => c.name === ref.id) || p.cast.some((c) => c.characterName === ref.id);
      return { title: ref.id, sub: [prof?.role, prof?.race].filter(Boolean).join(' · ') || `${d.characters.find((c) => c.name === ref.id)?.sceneIds.length ?? 0} scenes`, imageId: prof?.portraitId, missing: !known };
    }
    case 'place': {
      const pl = bibleOf(p).places.find((x) => x.id === ref.id);
      return { title: pl?.name ?? 'Place', sub: pl?.description.slice(0, 80) ?? '', imageId: pl?.imageId, missing: !pl };
    }
    case 'scene': {
      const s = d.sceneById.get(ref.id);
      const day = p.sceneMeta[ref.id]?.storyDay;
      return { title: s ? `${s.number}. ${s.heading}` : 'Scene', sub: s ? [day ? `Day ${day}` : '', p.sceneMeta[ref.id]?.synopsis || s.firstAction].filter(Boolean).join(' · ').slice(0, 90) : '', missing: !s };
    }
    case 'location': {
      const l = p.locations.find((x) => x.id === ref.id);
      return { title: l?.realName || l?.setName || 'Location', sub: l?.address ?? '', imageId: l?.photoIds?.[0], missing: !l };
    }
    case 'shot': {
      const s = p.shots.find((x) => x.id === ref.id);
      return { title: s ? `Shot ${s.shotNumber}` : 'Shot', sub: s ? [s.shotType, s.lens, s.name].filter(Boolean).join(' · ') : '', missing: !s };
    }
  }
}

export function openRef(ref: NonNullable<BoardItem['ref']>) {
  const go = (tab: string) => window.dispatchEvent(new CustomEvent('opengate:goto', { detail: tab }));
  if (ref.kind === 'character') openCharacter(ref.id);
  else if (ref.kind === 'place') go('bible');
  else if (ref.kind === 'scene') go('breakdown');
  else if (ref.kind === 'location') go('locations');
  else go('shots');
}

export function CardBody({ item }: { item: BoardItem }) {
  const p = useProject();
  const d = useDerived();
  const info = item.ref ? refInfo(p, d, item.ref) : { title: 'Card', sub: '', missing: true };
  const img = useMediaUrl(info.imageId);
  return (
    <div className={`ref-card k-${item.ref?.kind} ${info.missing ? 'missing' : ''}`} title={info.missing ? 'This was deleted from the project' : 'Double-click to open'}>
      {img && <img src={img} alt="" draggable={false} />}
      <div className="ref-card-text">
        <span className="ref-kind">{item.ref ? REF_LABEL[item.ref.kind] : ''}{info.missing ? ' · deleted' : ''}</span>
        <b>{info.title}</b>
        {info.sub && <span className="ref-sub">{info.sub}</span>}
      </div>
    </div>
  );
}

/** Note text with [[links]] turned into buttons that open the named thing. */
export function NoteText({ text }: { text: string }) {
  const p = useProject();
  const d = useDerived();
  if (!text.includes('[[')) return <>{text}</>;
  const parts = text.split(/(\[\[[^\]\n]{1,80}\]\])/g);
  const resolve = (name: string): BoardItem['ref'] | null => {
    const n = name.trim().toUpperCase();
    if (characterEntries(p, d).some((c) => c.name === n)) return { kind: 'character', id: n };
    const pl = bibleOf(p).places.find((x) => x.name.trim().toUpperCase() === n);
    if (pl) return { kind: 'place', id: pl.id };
    const l = p.locations.find((x) => (x.realName || x.setName).trim().toUpperCase() === n);
    if (l) return { kind: 'location', id: l.id };
    const s = d.scenes.find((x) => x.number.toUpperCase() === n.replace(/^(SC(ENE)?\.?\s*)/, '') || x.heading.toUpperCase() === n);
    if (s) return { kind: 'scene', id: s.id };
    return null;
  };
  return <>{parts.map((part, i) => {
    const m = part.match(/^\[\[(.+)\]\]$/);
    if (!m) return <span key={i}>{part}</span>;
    const ref = resolve(m[1]);
    return ref
      ? <button key={i} className="wikilink" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); openRef(ref); }}>{m[1]}</button>
      : <span key={i} className="wikilink broken" title="Nothing with this name yet">{m[1]}</span>;
  })}</>;
}

export { wikiLinks };

// ---------- Story-map templates ----------

export type TemplateId = 'blank' | 'relationships' | 'beats' | 'timeline' | 'investigation' | 'places';
export const TEMPLATES: { id: TemplateId; label: string; hint: string }[] = [
  { id: 'blank', label: 'Blank story map', hint: 'An empty canvas for cards, notes and connectors.' },
  { id: 'relationships', label: 'Relationship map', hint: 'Every character as a card, joined by the relationships you’ve set.' },
  { id: 'beats', label: 'Beat board', hint: 'The beats of your story structure in order, ready to fill with scenes.' },
  { id: 'timeline', label: 'Story-day timeline', hint: 'A column per story day with its scenes as cards.' },
  { id: 'investigation', label: 'Investigation board', hint: 'Clues and suspects joined with red string.' },
  { id: 'places', label: 'Places map', hint: 'Story places and real shooting locations, linked.' },
];

/** Items for a new story map from a template, using what's in the project. */
export function templateItems(id: TemplateId): BoardItem[] {
  const p = useStore.getState().project!;
  const d = derive(p.scriptDoc, p.sceneNumbersLocked);
  const items: BoardItem[] = [];
  const card = (kind: BoardRefKind, refId: string, x: number, y: number) => { const c = makeItem('card', x, y, { ref: { kind, id: refId } }); items.push(c); return c; };
  if (id === 'relationships') {
    const names = characterEntries(p, d).filter((c) => c.profile || c.lines > 0).map((c) => c.name);
    const r = Math.max(240, names.length * 60);
    const byName = new Map<string, BoardItem>();
    names.forEach((n, i) => { const a = (i / Math.max(1, names.length)) * Math.PI * 2 - Math.PI / 2; byName.set(n, card('character', n, Math.cos(a) * r, Math.sin(a) * r)); });
    for (const rel of p.relationships ?? []) {
      const a = byName.get(rel.a), b = byName.get(rel.b);
      if (a && b) items.push(connector(a.id, b.id, { caption: rel.label || kindOf(rel.kind).label, color: kindOf(rel.kind).color, arrow: rel.oneWay ? 'end' : 'none', dashed: (rel.tone ?? 0) < 0 }));
    }
  }
  if (id === 'beats') {
    const fw = FRAMEWORKS.find((f) => f.id === p.structure?.frameworkId) ?? FRAMEWORKS[0];
    let prev: BoardItem | null = null;
    fw.beats.forEach((bt, i) => {
      const n = makeItem('note', (i % 5) * 260, Math.floor(i / 5) * 220, { text: `${bt.name}\n\n${bt.what}`, color: ['#FEF08A', '#BFDBFE', '#FBCFE8', '#BBF7D0', '#FED7AA'][Math.floor(i / 5) % 5] });
      items.push(n);
      if (prev) items.push(connector(prev.id, n.id));
      prev = n;
    });
    items.unshift(makeItem('frame', 520, -170, { caption: fw.name, w: 1300, h: 60, color: '#E4E4E7' }));
  }
  if (id === 'timeline') {
    const by = scenesByDay(p, d);
    let col = 0;
    for (const [day, ids] of by) {
      const x = col * 280;
      items.push(makeItem('frame', x + 120, 0, { caption: day ? `Day ${day}` : 'No day yet', w: 260, h: 130 + ids.length * 110, color: '#E4E4E7' }));
      ids.forEach((sid, i) => card('scene', sid, x + 120, 120 + i * 110));
      col++;
    }
  }
  if (id === 'investigation') {
    const clues = ['The victim', 'Suspect 1', 'Suspect 2', 'The weapon', 'The alibi', 'What doesn’t fit'];
    const notes = clues.map((t, i) => makeItem('note', (i % 3) * 300 + (i % 2) * 40, Math.floor(i / 3) * 260 + (i % 3) * 20, { text: t, color: i ? '#F5F5F4' : '#FEF08A' }));
    items.push(...notes);
    for (let i = 1; i < notes.length; i++) items.push(connector(notes[0].id, notes[i].id, { color: '#DC2626', arrow: 'none', strokeWidth: 2 }));
  }
  if (id === 'places') {
    const b = bibleOf(p);
    b.places.forEach((pl, i) => {
      const c = card('place', pl.id, (i % 4) * 280, Math.floor(i / 4) * 260);
      if (pl.locationId) { const l = card('location', pl.locationId, (i % 4) * 280, Math.floor(i / 4) * 260 + 130); items.push(connector(c.id, l.id, { caption: 'shot at', arrow: 'end' })); }
    });
    p.locations.filter((l) => !b.places.some((pl) => pl.locationId === l.id)).forEach((l, i) => card('location', l.id, (i % 4) * 280, -200 - Math.floor(i / 4) * 130));
  }
  return items;
}

/** Order for timeline arrange: scene cards by story day then script order; others after. */
export function timelineOrder(p: Project, d: Derived) {
  return (i: BoardItem) => {
    if (i.ref?.kind !== 'scene') return 1e9 + i.x;
    const s = d.sceneById.get(i.ref.id);
    return (p.sceneMeta[i.ref.id]?.storyDay ?? 0) * 10000 + (s?.index ?? 0);
  };
}

export type { Board };
