import { useMemo, useState } from 'react';
import { FAQ, FAQ_GROUPS, type FaqLink } from '../reference/faq';
import { openReference } from '../tabs/ReferenceTab';
import { issueUrl } from './feedback';

// The FAQ: grouped, searchable questions that open to their answers.

const goto = (tab: string) => window.dispatchEvent(new CustomEvent('opengate:goto', { detail: tab }));

function Link({ l }: { l: FaqLink }) {
  if (l.url) return <a className="button-like small" href={l.url} target="_blank" rel="noreferrer noopener">{l.label} ↗</a>;
  return <button className="small" onClick={() => (l.ref ? openReference(l.ref) : goto(l.tab!))}>{l.label} →</button>;
}

export function FaqView({ open: first }: { open?: string }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set(first ? [first] : []));
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? FAQ.filter((f) => `${f.q} ${f.a}`.toLowerCase().includes(t)) : FAQ;
  }, [q]);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="faq">
      <input className="faq-search" type="search" value={q} placeholder="Search the questions" aria-label="Search the questions" onChange={(e) => setQ(e.target.value)} />
      {FAQ_GROUPS.map((g) => {
        const list = shown.filter((f) => f.group === g);
        if (!list.length) return null;
        return (
          <section key={g}>
            <h4>{g}</h4>
            {list.map((f) => (
              <div key={f.id} id={`faq-${f.id}`} className={`faq-item ${open.has(f.id) || q.trim() ? 'open' : ''}`}>
                <button className="faq-q" aria-expanded={open.has(f.id) || !!q.trim()} onClick={() => toggle(f.id)}>{f.q}</button>
                {(open.has(f.id) || q.trim()) && (
                  <div className="faq-a">
                    <p>{f.a}</p>
                    {f.links?.length ? <div className="row wrap">{f.links.map((l) => <Link key={l.label} l={l} />)}</div> : null}
                  </div>
                )}
              </div>
            ))}
          </section>
        );
      })}
      {!shown.length && <p className="muted">Nothing matches “{q}”.</p>}
      <p className="small">Didn’t find it? <a href={issueUrl('question')} target="_blank" rel="noreferrer noopener">Ask on GitHub ↗</a> <span className="muted">(public; needs a free GitHub account)</span></p>
    </div>
  );
}
