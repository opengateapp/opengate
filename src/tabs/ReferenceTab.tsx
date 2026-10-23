import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { useDerived, useProject, useStore } from '../store/project';
import { newId } from '../model/ids';
import { CATEGORIES, PAGES, pageById, type RefCategory, type RefPage } from '../reference/topics';
import { TOOLS } from '../reference/Tools';
import { ARC_GUIDE, FRAMEWORKS, placeBeats, type Framework } from '../reference/story';
import { LIBRARY, RESOURCE_TYPES, TOPIC_LABELS, learnMore, type Resource, type ResourceType } from '../reference/library';
import { templateDoc } from './DocsTab';
import { budgetVisible, canEdit, useSync } from '../sync/state';
import { toast } from '../components/common';
import { getMedia, putMedia } from '../store/media';
import { askConfirm } from '../components/dialogs';

// Reference: a small film school inside Open Gate. Plain-language pages by topic, calculators,
// story structures you can apply to your script, and a library of places to learn more.

/** Which page the Reference tab shows; "?" links elsewhere set it. */
export const useRefFocus = create<{ page: string }>(() => ({ page: 'frameworks' }));

export function openReference(page: string) {
  useRefFocus.setState({ page });
  window.dispatchEvent(new CustomEvent('opengate:goto', { detail: 'reference' }));
}

/** A small "?" that opens a Reference page. */
export function RefLink({ page, label }: { page: string; label?: string }) {
  const p = pageById(page);
  return <button className="ref-link" title={`Reference: ${p?.title ?? page}`} aria-label={`Reference: ${p?.title ?? page}`} onClick={() => openReference(page)}>?{label ? ` ${label}` : ''}</button>;
}

export function ReferenceTab() {
  const page = useRefFocus((s) => s.page);
  const [q, setQ] = useState('');
  const [collapsed, setCollapsedState] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('opengate.refCollapsed') ?? '[]'); } catch { return []; } });
  const setCollapsed = (c: string[]) => { setCollapsedState(c); try { localStorage.setItem('opengate.refCollapsed', JSON.stringify(c)); } catch { /* ignore */ } };
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return PAGES.filter((p) => `${p.title} ${p.lead} ${p.keywords ?? ''} ${p.sections.map((s) => s.p).join(' ')}`.toLowerCase().includes(t));
  }, [q]);
  const go = (id: string) => { useRefFocus.setState({ page: id }); setQ(''); document.querySelector('.ref-main')?.scrollTo({ top: 0 }); };

  return (
    <div className="with-side reference-tab">
      <aside className="side" data-panel="Topics" data-panel-pick>
        <div className="pad-x ref-search keep-open"><input type="search" placeholder="Search reference…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {q ? (
          <ul className="doc-list">
            {results.map((p) => <li key={p.id} onClick={() => go(p.id)}><span><b>{p.title}</b><br /><span className="muted small">{CATEGORIES.find((c) => c.id === p.category)?.label}</span></span></li>)}
            {!results.length && <li className="muted small">Nothing found.</li>}
          </ul>
        ) : (
          <nav className="ref-nav keep-open">
            <div className="row ref-nav-tools"><button className="link small" onClick={() => setCollapsed(CATEGORIES.map((c) => c.id))}>Collapse all</button><button className="link small" onClick={() => setCollapsed([])}>Expand all</button></div>
            {CATEGORIES.map((c) => {
              const here = pageById(page)?.category === c.id;
              const open = here || !collapsed.includes(c.id);
              return (
                <div key={c.id}>
                  <button className={`ref-cat ${open ? 'open' : ''}`} aria-expanded={open} onClick={() => setCollapsed(open ? [...collapsed, c.id] : collapsed.filter((x) => x !== c.id))}>
                    <span aria-hidden>{open ? '▾' : '▸'}</span> <span aria-hidden>{c.icon}</span> {c.label} <span className="muted small">{PAGES.filter((p) => p.category === c.id).length}</span>
                  </button>
                  {open && PAGES.filter((p) => p.category === c.id).map((p, i, all) => [
                    p.group && p.group !== all[i - 1]?.group ? <span key={`g-${p.group}`} className="ref-group">{p.group}</span> : null,
                    <button key={p.id} className={`side-link ${page === p.id ? 'active' : ''}`} onClick={() => go(p.id)}>{p.category === 'guilds' && p.group !== 'Overview' ? p.title.split(' — ')[0] : p.title}</button>,
                  ])}
                </div>
              );
            })}
            <div><h5><span aria-hidden>❖</span> More</h5><button className={`side-link ${page === 'library' ? 'active' : ''}`} onClick={() => go('library')}>Learn-more library</button></div>
          </nav>
        )}
      </aside>
      <section className="main pad scroll ref-main">
        {page === 'library' ? <Library /> : <RefPageView page={pageById(page) ?? PAGES[0]} />}
      </section>
    </div>
  );
}

function RefPageView({ page }: { page: RefPage }) {
  const tools = page.tool ? (Array.isArray(page.tool) ? page.tool : [page.tool]) : [];
  const more = learnMore(page.topics);
  return (
    <article className="ref-page">
      <span className="muted small">{CATEGORIES.find((c) => c.id === page.category)?.label}</span>
      <h2>{page.title}</h2>
      <p className="ref-lead">{page.lead}</p>
      {page.sections.map((s, i) => <section key={i}>{s.h && <h4>{s.h}</h4>}<p className={s.p.includes('\n') ? 'pre-line' : ''}>{s.p}</p></section>)}
      {tools.map((t) => {
        if (t === 'frameworks') return <Frameworks key={t} />;
        if (t === 'arcs') return <Arcs key={t} />;
        const Tool = TOOLS[t];
        return Tool ? <div key={t} className="tool-card"><Tool /></div> : null;
      })}
      {page.table && (
        <div className="table-scroll"><table className={`table compact ref-table ${page.category === 'guilds' ? 'wrap' : ''}`}>
          <thead><tr>{page.table.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{page.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{/^https?:\/\//.test(c) ? <a href={c} target="_blank" rel="noreferrer noopener">Open ↗</a> : c}</td>)}</tr>)}</tbody>
        </table></div>
      )}
      {page.guild && <AgreementBox guildId={page.guild} title={page.title.split(' — ')[0]} />}
      {page.use?.length ? (
        <div className="ref-use"><b className="small">Use it in Open Gate</b>
          <div className="row wrap">{page.use.map((u) => <button key={u.tab + u.label} className="small" onClick={() => window.dispatchEvent(new CustomEvent('opengate:goto', { detail: u.tab }))}>{u.label} →</button>)}</div>
        </div>
      ) : null}
      {page.sources?.length ? (
        <div className="ref-sources">
          {page.notice && <p className="ref-notice">⚖ {page.notice}</p>}
          <b className="small">Sources</b>
          <ul>{page.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer noopener">{s.label}</a></li>)}</ul>
          {page.checked && <p className="muted small">Checked {new Date(page.checked + 'T12:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}; rules and tiers change, so always confirm with the union.</p>}
        </div>
      ) : null}
      {more.length > 0 && page.category !== 'guilds' && (
        <div className="ref-more"><b className="small">Learn more</b>
          <ul className="res-list">{more.map((r) => <ResourceItem key={r.id} r={r} />)}</ul>
          <button className="link small" onClick={() => useRefFocus.setState({ page: 'library' })}>The whole library →</button>
        </div>
      )}
    </article>
  );
}

/** Your own signed copy of a union's agreement, kept with the (private) budget. */
function AgreementBox({ guildId, title }: { guildId: string; title: string }) {
  const p = useProject();
  const update = useStore((s) => s.update);
  useSync((s) => s.write);
  if (!budgetVisible()) return null;
  const ro = !canEdit('budget');
  const mine = (p.budget.agreements ?? []).filter((a) => a.guildId === guildId);
  const add = async (files: File[]) => {
    for (const f of files.filter((x) => x.type === 'application/pdf' || /\.(pdf|png|jpe?g)$/i.test(x.name))) {
      const fileId = await putMedia(p.id, f);
      update((d) => { d.budget.agreements ??= []; d.budget.agreements.push({ id: newId(), guildId, title: f.name.replace(/\.[a-z0-9]+$/i, ''), fileId, added: new Date().toISOString() }); }, 'Attach agreement');
    }
  };
  const open = async (id: string) => {
    const b = await getMedia(id);
    if (!b) { toast('This file hasn’t arrived on this device yet'); return; }
    const url = URL.createObjectURL(b); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  return (
    <div className="ref-agreement tool-card">
      <b className="small">Your signed {title} agreement</b>
      {mine.length ? <ul className="doc-rows">{mine.map((a) => (
        <li key={a.id}><button className="link" onClick={() => void open(a.fileId)}>📄 {a.title}</button><span className="muted small">{new Date(a.added).toLocaleDateString()}</span>
          {!ro && <button className="icon-btn" aria-label="Remove agreement" onClick={async () => { if (await askConfirm(`Remove “${a.title}”?`)) update((d) => { d.budget.agreements = (d.budget.agreements ?? []).filter((x) => x.id !== a.id); }, 'Remove agreement'); }}>×</button>}</li>
      ))}</ul> : <p className="muted small">Keep the agreement you signed here, so it’s on hand during the shoot. It stays private with the budget.</p>}
      {!ro && <label className="button-like small">📎 Attach PDF…<input type="file" hidden accept="application/pdf,image/*" onChange={(e) => { void add([...(e.target.files ?? [])]); e.target.value = ''; }} /></label>}
    </div>
  );
}

function Frameworks() {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  useSync((s) => s.write);
  const [id, setId] = useState(p.structure?.frameworkId ?? 'three-act');
  const fw = FRAMEWORKS.find((f) => f.id === id) ?? FRAMEWORKS[0];
  const ro = !canEdit('structure');
  useEffect(() => { if (p.structure?.frameworkId) setId(p.structure.frameworkId); }, [p.structure?.frameworkId]);

  const use = (f: Framework) => {
    update((dr) => {
      dr.structure = { frameworkId: f.id };
      const placed = placeBeats(f, d);
      dr.docs.push({ id: newId(), title: `Beat sheet — ${f.name}`, updatedAt: new Date().toISOString(), doc: templateDoc([`# ${f.name}`, `Credit: ${f.credit}`, '', ...placed.flatMap(({ beat: b, label, pct, sceneId }) => [`## ${b.name} (${d.scenes.length ? `${label}, ` : ''}${pct}%)`, b.what, ...(sceneId && d.sceneById.get(sceneId) ? [`Now: scene ${d.sceneById.get(sceneId)!.number} — ${d.sceneById.get(sceneId)!.heading}`] : []), ''])]) });
    }, `Use ${f.name}`);
    toast(`Beat sheet added to Docs; beats now show in Screenplay → Scenes`, { label: 'Open Docs', run: () => window.dispatchEvent(new CustomEvent('opengate:goto', { detail: 'docs' })) });
  };

  return (
    <div className="frameworks">
      <div className="fw-pick">{FRAMEWORKS.map((f) => <button key={f.id} className={`chip pick ${f.id === id ? 'on' : ''}`} onClick={() => setId(f.id)}>{f.name}{p.structure?.frameworkId === f.id ? ' ✓' : ''}</button>)}</div>
      <div className="tool-card">
        <h3>{fw.name}</h3>
        <p className="muted small">{fw.credit}</p>
        <p>{fw.short}</p>
        <div className="fw-meta"><div><b className="small">Good for</b><p>{fw.goodFor}</p></div><div><b className="small">Strengths</b><p>{fw.pros}</p></div><div><b className="small">Watch out</b><p>{fw.cons}</p></div></div>
        <div className="table-scroll"><table className="table compact">
          <thead><tr><th>Beat</th><th>Where{d.scenes.length ? ` (of ${d.pageCount} page${d.pageCount === 1 ? '' : 's'})` : ''}</th>{d.scenes.length > 0 && <th>Lands on</th>}<th>What happens</th></tr></thead>
          <tbody>{placeBeats(fw, d).map(({ beat: b, label, pct, sceneId }, i) => {
            const s = sceneId ? d.sceneById.get(sceneId) : undefined;
            return <tr key={i}><td><b>{b.name}</b></td><td className="nowrap">{d.scenes.length ? `${label} · ${pct}%` : `${pct}%`}</td>{d.scenes.length > 0 && <td className="small">{s ? `Sc ${s.number} — ${s.heading}` : '—'}</td>}<td>{b.what}</td></tr>;
          })}</tbody>
        </table></div>
        {!ro && <div className="row wrap">
          <button className="primary" onClick={() => use(fw)}>Use this structure</button>
          {p.structure && <button onClick={() => update((dr) => { delete dr.structure; }, 'Stop using structure')}>Hide beats in the script</button>}
        </div>}
      </div>
    </div>
  );
}

function Arcs() {
  return (
    <div className="arc-grid">
      {ARC_GUIDE.map((a) => <div key={a.name} className="tool-card"><b>{a.name}</b><p>{a.what}</p><p className="muted small">e.g. {a.example}</p></div>)}
    </div>
  );
}

function ResourceItem({ r }: { r: Resource }) {
  return (
    <li className="res-item">
      <a href={r.url} target="_blank" rel="noreferrer noopener"><b>{r.name}</b></a>{r.by && <span className="muted small"> — {r.by}</span>}
      <span className="res-tags"><span className="chip small">{RESOURCE_TYPES.find((t) => t.id === r.type)?.label.replace(/s$/, '')}</span>{!r.free && <span className="chip small">paid</span>}<span className="chip small">{r.level}</span></span>
      <p className="small">{r.desc}</p>
    </li>
  );
}

function Library() {
  const [type, setType] = useState<ResourceType | ''>('');
  const [topic, setTopic] = useState('');
  const [freeOnly, setFreeOnly] = useState(false);
  const list = LIBRARY.filter((r) => (!type || r.type === type) && (!topic || r.topics.includes(topic)) && (!freeOnly || r.free));
  const topics = [...new Set(LIBRARY.flatMap((r) => r.topics))];
  return (
    <article className="ref-page">
      <h2>Learn-more library</h2>
      <p className="ref-lead">Channels, sites, books, podcasts and free tools worth your time. One line each, in our own words; no affiliate links.</p>
      <div className="toolbar flat wrap">
        <select value={type} onChange={(e) => setType(e.target.value as ResourceType | '')}><option value="">Every type</option>{RESOURCE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
        <select value={topic} onChange={(e) => setTopic(e.target.value)}><option value="">Every topic</option>{topics.map((t) => <option key={t} value={t}>{TOPIC_LABELS[t] ?? t}</option>)}</select>
        <label className="check"><input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} /> Free only</label>
        <span className="muted small">{list.length} of {LIBRARY.length}</span>
      </div>
      {RESOURCE_TYPES.filter((t) => list.some((r) => r.type === t.id)).map((t) => (
        <section key={t.id}><h4>{t.label}</h4><ul className="res-list">{list.filter((r) => r.type === t.id).map((r) => <ResourceItem key={r.id} r={r} />)}</ul></section>
      ))}
      <p className="muted small">Know a great resource? <a href="https://github.com/opengateapp/opengate/issues/new?title=Suggest%20a%20resource" target="_blank" rel="noreferrer noopener">Suggest it on GitHub</a>.</p>
    </article>
  );
}

export type { RefCategory };
