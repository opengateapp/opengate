import { useEffect, useMemo, useState } from 'react';
import { getDerived, useDerived, useProject, useStore } from '../../store/project';
import type { CreditStyle, CreditsSettings } from '../../model/types';
import { buildCredits, creditWarnings, creditsOf, defaultCredits, newCustomBlock, rollLines, suggestedRuntime, visibleBlocks, type CreditBlock } from '../../credits/credits';
import { creditsCsv, creditsFcpxml, creditsJsx, creditsText, rollColumns, type RollOptions } from '../../credits/exportCredits';
import { budgetVisible, canEdit, useSync } from '../../sync/state';
import { download, safeName } from '../../io/files';
import { openActions } from '../../components/ActionSheet';
import { toast } from '../../components/common';
import { More } from '../../components/More';
import { Hint } from '../../components/Hint';

// Exports → End credits: everything for the end roll, assembled live from the project, arranged
// here and exported for whatever builds the roll (any NLE's scrolling title, After Effects,
// Final Cut, a credits service) — plus a PDF for checking spelling.

const STYLES: { id: CreditStyle; label: string }[] = [
  { id: 'card', label: 'Title cards' }, { id: 'columns', label: 'Two columns' }, { id: 'centered', label: 'Centred' }, { id: 'names', label: 'Names only' },
];
const SIZES = [{ id: 'hd', label: 'HD 1920×1080', w: 1920, h: 1080 }, { id: 'uhd', label: 'UHD 3840×2160', w: 3840, h: 2160 }, { id: 'dci', label: 'DCI 2K 2048×1080', w: 2048, h: 1080 }];
const RATES = [23.976, 24, 25, 29.97, 30];

export function CreditsView({ onBack }: { onBack?: () => void }) {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  useSync((s) => s.write);
  const ro = !canEdit('credits');
  const c = creditsOf(p);
  const blocks = useMemo(() => buildCredits(p, d, { includeLicenses: budgetVisible() }), [p, d]);
  const [sel, setSel] = useState<string>(() => blocks[0]?.id ?? 'cast');
  const [size, setSize] = useState('hd');
  const [fps, setFps] = useState(24);
  const [playing, setPlaying] = useState(false);
  const current = blocks.find((b) => b.id === sel) ?? blocks[0];
  const runtime = c.runtime ?? suggestedRuntime(blocks, c.secondsPerScreen);
  const warnings = creditWarnings(p);

  const set = (fn: (x: CreditsSettings) => void, label: string | null = 'End credits') => update((dr) => {
    const cur = { ...defaultCredits(), ...dr.credits } as CreditsSettings;
    if (!cur.order.length) cur.order = blocks.map((b) => b.id);
    fn(cur);
    dr.credits = cur;
  }, label);
  const move = (id: string, by: -1 | 1) => set((x) => { const i = x.order.indexOf(id); const j = i + by; if (i < 0 || j < 0 || j >= x.order.length) return; [x.order[i], x.order[j]] = [x.order[j], x.order[i]]; }, 'Reorder credits');
  const [drag, setDrag] = useState<string | null>(null);

  const opts = (): RollOptions => { const s = SIZES.find((x) => x.id === size)!; return { width: s.w, height: s.h, fps, runtime, title: p.title || 'Untitled' }; };
  const name = safeName(p.title);
  const exportMenu = (at: { x: number; y: number }) => openActions('Export end credits', [
    { label: 'Text — two columns (.txt)', run: () => download(`${name} - end credits.txt`, creditsText(blocks, 'columns'), 'text/plain') },
    { label: 'Text — centred (.txt)', run: () => download(`${name} - end credits (centred).txt`, creditsText(blocks, 'centered'), 'text/plain') },
    { label: 'Copy text to clipboard', run: async () => { try { await navigator.clipboard.writeText(creditsText(blocks, 'columns')); toast('Credits copied — paste into your editor’s scrolling title'); } catch { toast('Copy didn’t work here — use the .txt download'); } } },
    { label: 'Spreadsheet (.csv)', run: () => download(`${name} - end credits.csv`, creditsCsv(blocks), 'text/csv') },
    { label: 'After Effects script (.jsx)', run: () => download(`${name} - end credits.jsx`, creditsJsx(blocks, opts()), 'text/javascript') },
    { label: 'Final Cut Pro (.fcpxml)', run: () => download(`${name} - end credits.fcpxml`, creditsFcpxml(blocks, opts()), 'application/xml') },
    { label: 'PDF to check spelling', run: async () => { const { creditsPdf } = await import('../../pdf/creditsPdf'); download(`${name} - end credits.pdf`, creditsPdf(p.title, blocks).output('blob'), 'application/pdf'); } },
  ], at);

  return (
    <div className="with-side reports-sub credits-view">
      <aside className="side" data-panel="Sections" data-panel-pick>
        {onBack && <div className="side-head"><button className="link" onClick={onBack}>← Reports</button></div>}
        <div className="side-head"><h3>End credits</h3>{!ro && <button className="small" onClick={() => { const b = newCustomBlock(); set((x) => { x.custom.push(b); x.order.splice(Math.max(0, x.order.indexOf('legal')), 0, b.id); }, 'Add credits section'); setSel(b.id); }}>＋ Section</button>}</div>
        <ul className="credit-blocks">
          {blocks.map((b) => (
            <li key={b.id} className={`${sel === b.id ? 'active' : ''} ${b.hidden ? 'off' : ''}`} draggable={!ro}
              onDragStart={() => setDrag(b.id)} onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (!drag || drag === b.id) return; set((x) => { const from = x.order.indexOf(drag); x.order.splice(from, 1); x.order.splice(x.order.indexOf(b.id), 0, drag); }, 'Reorder credits'); setDrag(null); }}
              onClick={() => setSel(b.id)}>
              <span className="grow"><b>{b.heading || (b.id === 'cards' ? 'Opening cards' : b.id === 'legal' ? 'Copyright & legal' : 'Untitled')}</b><span className="muted small"> {b.lines.length}</span></span>
              {!ro && <span className="row nowrap credit-tools" onClick={(e) => e.stopPropagation()}>
                <button className="icon-btn" aria-label="Move up" onClick={() => move(b.id, -1)}>↑</button>
                <button className="icon-btn" aria-label="Move down" onClick={() => move(b.id, 1)}>↓</button>
                <button className="icon-btn" aria-label={b.hidden ? 'Show section' : 'Hide section'} title={b.hidden ? 'Hidden — click to include' : 'Included — click to hide'} onClick={() => set((x) => { x.hiddenBlocks = b.hidden ? x.hiddenBlocks.filter((y) => y !== b.id) : [...x.hiddenBlocks, b.id]; }, b.hidden ? 'Show credits section' : 'Hide credits section')}>{b.hidden ? '◌' : '●'}</button>
              </span>}
            </li>
          ))}
        </ul>
      </aside>
      <section className="main pad scroll credits-main">
        <div className="toolbar flat wrap">
          <h3>End credits</h3>
          <span className="muted small">{rollLines(blocks)} lines · {Math.floor(runtime / 60)}:{String(runtime % 60).padStart(2, '0')}</span>
          <span className="spacer" />
          <More label="Roll settings">
            <label className="field inline"><span>Frame</span><select value={size} onChange={(e) => setSize(e.target.value)}>{SIZES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
            <label className="field inline"><span>fps</span><select value={fps} onChange={(e) => setFps(Number(e.target.value))}>{RATES.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
          </More>
          <button className="primary" onClick={(e) => exportMenu({ x: e.clientX, y: e.clientY })}>Export ▾</button>
        </div>
        <p className="muted small"><Hint>{'Names come straight from your project (Contacts, Settings → Cast and Crew, Locations, Budget → Licenses), so the credits stay up to date. Export text to paste into any editor’s scrolling title (Premiere, Resolve, Final Cut, Avid…), an After Effects script that builds the roll, or Final Cut XML (one title clip for the runtime; new and not yet tested in Final Cut itself, so tell us if it doesn’t import).'}</Hint></p>
        {warnings.length > 0 && <ul className="license-warnings">{warnings.map((w) => <li key={w} className="small">⚠ {w}</li>)}</ul>}

        <div className="credits-layout">
          <div className="credits-edit">
            {current && <BlockEditor b={current} ro={ro} set={set} c={c} />}
            <div className="card credits-settings">
              <b className="small">Roll</b>
              <div className="form-grid tight">
                <label className="field"><span>Cast order</span><select disabled={ro} value={c.castOrder} onChange={(e) => set((x) => { x.castOrder = e.target.value as CreditsSettings['castOrder']; }, 'Cast order')}><option value="number">Cast number</option><option value="appearance">Order of appearance</option><option value="alpha">Alphabetical</option></select></label>
                <label className="field"><span>Speed (seconds per screen)</span><input type="number" min={3} max={30} disabled={ro} value={c.secondsPerScreen} onChange={(e) => set((x) => { x.secondsPerScreen = Math.max(3, Number(e.target.value) || 8); }, null)} /></label>
                <label className="field"><span>Runtime (seconds)</span><input type="number" min={5} disabled={ro} value={c.runtime ?? ''} placeholder={`${suggestedRuntime(blocks, c.secondsPerScreen)} (auto)`} onChange={(e) => set((x) => { x.runtime = e.target.value ? Math.max(5, Number(e.target.value)) : undefined; }, null)} /></label>
                <label className="field"><span>Copyright line</span><input disabled={ro} value={c.copyright ?? ''} placeholder={`© ${new Date().getFullYear()} ${p.production.company || p.title}. All rights reserved.`} onChange={(e) => set((x) => { x.copyright = e.target.value || undefined; }, null)} /></label>
              </div>
              <label className="field wide"><span>Special thanks (one per line)</span><textarea rows={4} disabled={ro} value={c.thanks} onChange={(e) => set((x) => { x.thanks = e.target.value; }, null)} /></label>
              <div className="row wrap">
                <label className="check"><input type="checkbox" disabled={ro} checked={!!c.legal.fiction} onChange={(e) => set((x) => { x.legal.fiction = e.target.checked; })} /> Fiction disclaimer</label>
                <label className="check"><input type="checkbox" disabled={ro} checked={!!c.legal.animals} onChange={(e) => set((x) => { x.legal.animals = e.target.checked; })} /> No animals harmed</label>
                <label className="check"><input type="checkbox" disabled={ro} checked={!!c.legal.openGate} onChange={(e) => set((x) => { x.legal.openGate = e.target.checked; })} /> “Made with Open Gate”</label>
                <label className="check" title="ASC, ACE, CSA… for people ticked as members in Contacts; p.g.a. only when certified for this production"><input type="checkbox" disabled={ro} checked={!c.noSocietyLetters} onChange={(e) => set((x) => { if (e.target.checked) delete x.noSocietyLetters; else x.noSocietyLetters = true; })} /> Society letters after names</label>
              </div>
            </div>
          </div>
          <Preview blocks={blocks} runtime={runtime} playing={playing} onToggle={() => setPlaying((x) => !x)} />
        </div>
      </section>
    </div>
  );
}

function BlockEditor({ b, ro, set, c }: { b: CreditBlock; ro: boolean; set: (fn: (x: CreditsSettings) => void, label?: string | null) => void; c: CreditsSettings }) {
  const custom = c.custom.find((x) => x.id === b.id);
  return (
    <div className="card credit-block-editor">
      <div className="form-grid tight">
        <label className="field"><span>Heading</span><input disabled={ro} value={b.heading} placeholder="(no heading)" onChange={(e) => set((x) => { if (custom) x.custom.find((y) => y.id === b.id)!.heading = e.target.value; else x.headings[b.id] = e.target.value; }, null)} /></label>
        <label className="field"><span>Style</span><select disabled={ro} value={b.style} onChange={(e) => set((x) => { if (custom) x.custom.find((y) => y.id === b.id)!.style = e.target.value as CreditStyle; else x.styles[b.id] = e.target.value as CreditStyle; }, 'Credits style')}>{STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
      </div>
      {custom ? (
        <>
          <ul className="credit-lines">
            {custom.lines.map((l, i) => (
              <li key={i}>
                <input disabled={ro} value={l.role ?? ''} placeholder="Role (optional)" onChange={(e) => set((x) => { x.custom.find((y) => y.id === b.id)!.lines[i].role = e.target.value || undefined; }, null)} />
                <input disabled={ro} value={l.name} placeholder="Name" onChange={(e) => set((x) => { x.custom.find((y) => y.id === b.id)!.lines[i].name = e.target.value; }, null)} />
                {!ro && <button className="icon-btn" aria-label="Remove line" onClick={() => set((x) => { x.custom.find((y) => y.id === b.id)!.lines.splice(i, 1); }, 'Remove credit')}>×</button>}
              </li>
            ))}
          </ul>
          {!ro && <div className="row wrap">
            <button className="small" onClick={() => set((x) => { x.custom.find((y) => y.id === b.id)!.lines.push({ role: '', name: '' }); }, 'Add credit')}>＋ Line</button>
            <span className="spacer" />
            <button className="small danger-text" onClick={() => set((x) => { x.custom = x.custom.filter((y) => y.id !== b.id); x.order = x.order.filter((y) => y !== b.id); }, 'Remove credits section')}>Delete section</button>
          </div>}
        </>
      ) : (
        <>
          <ul className="credit-lines auto">
            {buildAllLines(b, c).map(({ key, role, name, hidden }) => (
              <li key={key} className={hidden ? 'off' : ''}>
                <label className="check"><input type="checkbox" disabled={ro} checked={!hidden} onChange={() => set((x) => { const k = `${b.id}|${key}`; x.hiddenLines = hidden ? x.hiddenLines.filter((y) => y !== k) : [...x.hiddenLines, k]; }, hidden ? 'Include in credits' : 'Leave out of credits')} /></label>
                <span className="muted small">{role}</span><span>{name.split('\n').join(' · ')}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">{AUTO_HELP[b.id.startsWith('crew-') ? 'crew' : b.id] ?? ''}</p>
        </>
      )}
    </div>
  );
}

/** The block's lines, including the ones left out (so they can be ticked back in). */
function buildAllLines(b: CreditBlock, c: CreditsSettings) {
  const p = useStore.getState().project!;
  const full = buildCredits({ ...p, credits: { ...c, hiddenLines: [] } }, getDerived(), { includeLicenses: budgetVisible() }).find((x) => x.id === b.id);
  return (full?.lines ?? b.lines).map((l) => ({ ...l, hidden: c.hiddenLines.includes(`${b.id}|${l.key}`) }));
}

const AUTO_HELP: Record<string, string> = {
  cards: 'From Settings → Production (company, director, producer) and the title page (writer).',
  cast: 'From Settings → Cast. Character names come from the script; add actor names there.',
  crew: 'From Settings → Crew and crew in Contacts, sorted into departments by their role.',
  music: 'From Budget → Licenses (music marked “in the end credits”).',
  footage: 'From Budget → Licenses (stock, archival and photos marked “in the end credits”).',
  licensed: 'From Budget → Licenses (fonts, software and other licenses marked “in the end credits”).',
  locations: 'From Plan → Locations.',
  vendors: 'From Plan → Contacts (vendors).',
  thanks: 'Type them in the Roll settings below.',
  legal: 'Copyright line and the options below.',
};

function Preview({ blocks, runtime, playing, onToggle }: { blocks: CreditBlock[]; runtime: number; playing: boolean; onToggle: () => void }) {
  const { left, right, center, big } = rollColumns(blocks);
  // Back to the first frame once the roll has gone by (a timer, since animationend isn't reliable everywhere).
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(onToggle, runtime * 1000 + 300);
    return () => clearTimeout(t);
  }, [playing, runtime]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="credits-preview-wrap">
      <div className="credits-preview" aria-label="Preview of the end credits">
        <div className={`credits-roll ${playing ? 'playing' : ''}`} style={{ animationDuration: `${runtime}s` }}>
          {left.map((l, i) => (
            <div key={i} className={`roll-row ${big[i] ? 'big' : ''}`}>
              {center[i] ? <span className="roll-center">{center[i]}</span> : <><span className="roll-left">{l}</span><span className="roll-right">{right[i]}</span></>}
            </div>
          ))}
        </div>
      </div>
      <div className="row"><button className="small" onClick={onToggle}>{playing ? '■ Stop' : '▶ Play the roll'}</button><span className="muted small">{visibleBlocks(blocks).length} sections</span></div>
    </div>
  );
}
