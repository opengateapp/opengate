import { useState } from 'react';
import { useDerived, useProject, useStore } from '../store/project';
import { newId } from '../model/ids';
import type { Contact, ContactKind } from '../model/types';
import { download, safeName } from '../io/files';
import { csv } from '../io/reports';
import { deletedToast } from '../components/deleted';
import { More } from '../components/More';
import { toast } from '../components/common';

// Contacts: one place for everyone on the production. Cast and crew are the same records
// the call sheets and Day Out of Days use; other contacts (vendors, agents, location owners) live here.

const KINDS: { id: ContactKind; label: string }[] = [
  { id: 'vendor', label: 'Vendor' }, { id: 'location', label: 'Location' }, { id: 'agent', label: 'Agent / rep' },
  { id: 'crew', label: 'Crew (not daily)' }, { id: 'cast', label: 'Cast (other)' }, { id: 'other', label: 'Other' },
];

interface Row { key: string; group: 'Cast' | 'Crew' | 'Contacts'; name: string; role: string; company: string; phone: string; email: string; kind?: ContactKind }

/** Minimal vCard reader (FN, ORG, TITLE, TEL, EMAIL, NOTE). */
export function parseVCards(text: string): Omit<Contact, 'id'>[] {
  const cards = text.replace(/\r\n[ \t]/g, '').split(/BEGIN:VCARD/i).slice(1);
  return cards.map((c) => {
    const get = (k: string) => (c.match(new RegExp(`^${k}(?:;[^:\\n]*)?:(.*)$`, 'im'))?.[1] ?? '').replace(/\\,/g, ',').replace(/\\n/g, '\n').trim();
    let name = get('FN');
    if (!name) { const n = get('N').split(';'); name = [n[1], n[0]].filter(Boolean).join(' '); }
    return { name: name || 'Unnamed', kind: 'other' as ContactKind, role: get('TITLE'), company: get('ORG').replace(/;/g, ' ').trim(), phone: get('TEL'), email: get('EMAIL'), notes: get('NOTE') };
  });
}

function toVCard(r: Row): string {
  const esc = (s: string) => s.replace(/,/g, '\\,').replace(/\n/g, '\\n');
  return ['BEGIN:VCARD', 'VERSION:3.0', `FN:${esc(r.name)}`, r.company && `ORG:${esc(r.company)}`, r.role && `TITLE:${esc(r.role)}`, r.phone && `TEL:${r.phone}`, r.email && `EMAIL:${r.email}`, 'END:VCARD'].filter(Boolean).join('\r\n');
}

export function ContactsTab() {
  const p = useProject();
  const d = useDerived();
  const update = useStore((s) => s.update);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<'all' | Row['group']>('all');
  const [over, setOver] = useState(false);

  const rows: Row[] = [
    ...[...p.cast].sort((a, b) => a.castNumber - b.castNumber).map((c) => ({ key: 'cast:' + c.id, group: 'Cast' as const, name: c.actorName, role: `#${c.castNumber} ${c.characterName}`, company: '', phone: c.phone ?? '', email: c.email ?? '' })),
    ...p.crew.map((c) => ({ key: 'crew:' + c.id, group: 'Crew' as const, name: c.name, role: c.role, company: '', phone: c.phone ?? '', email: '' })),
    ...p.contacts.map((c) => ({ key: 'contact:' + c.id, group: 'Contacts' as const, name: c.name, role: c.role, company: c.company, phone: c.phone, email: c.email, kind: c.kind })),
  ];
  const shown = rows.filter((r) => (group === 'all' || r.group === group) && (!q || `${r.name} ${r.role} ${r.company} ${r.phone} ${r.email}`.toLowerCase().includes(q.toLowerCase())));

  const set = (r: Row, field: 'name' | 'role' | 'company' | 'phone' | 'email' | 'kind', v: string) => update((dr) => {
    const [kind, id] = r.key.split(':');
    if (kind === 'cast') {
      const c = dr.cast.find((x) => x.id === id)!;
      if (field === 'name') c.actorName = v; else if (field === 'phone') c.phone = v; else if (field === 'email') c.email = v;
    } else if (kind === 'crew') {
      const c = dr.crew.find((x) => x.id === id)!;
      if (field === 'name') c.name = v; else if (field === 'role') c.role = v; else if (field === 'phone') c.phone = v;
    } else {
      const c = dr.contacts.find((x) => x.id === id)!;
      (c as unknown as Record<string, string>)[field] = v;
    }
  }, null);

  const remove = (r: Row) => {
    const [kind, id] = r.key.split(':');
    update((dr) => {
      if (kind === 'cast') dr.cast = dr.cast.filter((x) => x.id !== id);
      else if (kind === 'crew') dr.crew = dr.crew.filter((x) => x.id !== id);
      else dr.contacts = dr.contacts.filter((x) => x.id !== id);
    }, 'Remove contact');
    deletedToast(r.name || 'contact');
  };

  const add = (g: Row['group']) => update((dr) => {
    if (g === 'Cast') dr.cast.push({ id: newId(), castNumber: Math.max(0, ...dr.cast.map((c) => c.castNumber)) + 1, characterName: 'NEW CHARACTER', actorName: '', unavailable: [] });
    else if (g === 'Crew') dr.crew.push({ id: newId(), name: '', role: '', dailyDefault: true });
    else dr.contacts.push({ id: newId(), name: '', kind: 'vendor', role: '', company: '', phone: '', email: '', notes: '' });
  }, 'Add contact');

  const importFiles = async (files: File[]) => {
    const vcf = files.filter((f) => /\.vcf$/i.test(f.name) || f.type === 'text/vcard');
    if (!vcf.length) { toast('Drop contact cards (.vcf) to import them.'); return; }
    const cards = (await Promise.all(vcf.map((f) => f.text()))).flatMap(parseVCards);
    update((dr) => { for (const c of cards) dr.contacts.push({ id: newId(), ...c }); }, `Import ${cards.length} contacts`);
    toast(`Imported ${cards.length} contact${cards.length > 1 ? 's' : ''}`);
  };

  const missingCast = d.characters.filter((c) => !p.cast.some((x) => x.characterName === c.name));

  return (
    <div className={`contacts-tab pad scroll ${over ? 'drop-hover' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void importFiles([...e.dataTransfer.files]); }}>
      <div className="toolbar flat">
        <h3>Contacts</h3>
        <input placeholder="Search name, role, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg">
          {(['all', 'Cast', 'Crew', 'Contacts'] as const).map((g) => <button key={g} className={group === g ? 'active' : ''} onClick={() => setGroup(g)}>{g === 'all' ? 'All' : g === 'Contacts' ? 'Other' : g}</button>)}
        </div>
        <span className="spacer" />
        <button className="primary" onClick={() => add('Contacts')}>+ Contact</button>
        <More label="More contact actions">
        {missingCast.length > 0 && <button onClick={() => update((dr) => { let n = Math.max(0, ...dr.cast.map((c) => c.castNumber)); for (const c of missingCast) dr.cast.push({ id: newId(), castNumber: ++n, characterName: c.name, actorName: '', unavailable: [] }); }, 'Add cast from script')}>+ {missingCast.length} characters from script</button>}
        <button onClick={() => add('Cast')}>+ Cast</button>
        <button onClick={() => add('Crew')}>+ Crew</button>
        <label className="button-like">Import .vcf<input type="file" accept=".vcf,text/vcard" multiple hidden onChange={(e) => { void importFiles([...(e.target.files ?? [])]); e.target.value = ''; }} /></label>
        <button onClick={() => download(`${safeName(p.title)} contacts.vcf`, shown.map(toVCard).join('\r\n'), 'text/vcard')}>Export .vcf</button>
        <button onClick={() => download(`${safeName(p.title)} contacts.csv`, csv([['Group', 'Name', 'Role', 'Company', 'Phone', 'Email'], ...shown.map((r) => [r.group, r.name, r.role, r.company, r.phone, r.email])]), 'text/csv')}>CSV</button>
        </More>
      </div>
      <table className="table contacts cards-on-phone" onDoubleClick={(e) => { if ((e.target as HTMLElement).closest('tbody tr')) return; add(group === 'Cast' || group === 'Crew' ? group : 'Contacts'); }}>
        <thead><tr><th>Group</th><th>Name</th><th>Role</th><th>Company / type</th><th>Phone</th><th>Email</th><th /></tr></thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.key}>
              <td><span className={`pill g-${r.group}`}>{r.group === 'Contacts' ? KINDS.find((k) => k.id === r.kind)?.label ?? 'Other' : r.group}</span></td>
              <td><input value={r.name} placeholder={r.group === 'Cast' ? 'Actor name' : 'Name'} onChange={(e) => set(r, 'name', e.target.value)} /></td>
              <td>{r.group === 'Cast' ? <span className="muted">{r.role}</span> : <input value={r.role} onChange={(e) => set(r, 'role', e.target.value)} />}</td>
              <td>{r.group === 'Contacts'
                ? <div className="row"><input value={r.company} placeholder="Company" onChange={(e) => set(r, 'company', e.target.value)} />
                    <select value={r.kind} onChange={(e) => set(r, 'kind', e.target.value)}>{KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select></div>
                : <span className="muted small">—</span>}</td>
              <td><input value={r.phone} onChange={(e) => set(r, 'phone', e.target.value)} />{r.phone && <a className="icon-link" href={`tel:${r.phone}`} title="Call">☎</a>}</td>
              <td>{r.group === 'Crew' ? <span className="muted small">—</span> : <><input value={r.email} onChange={(e) => set(r, 'email', e.target.value)} />{r.email && <a className="icon-link" href={`mailto:${r.email}`} title="Email">✉</a>}</>}</td>
              <td><button className="icon-btn" onClick={() => remove(r)}>×</button></td>
            </tr>
          ))}
          {!shown.length && <tr><td colSpan={7} className="muted pad">No contacts. Double-click here to add one, or drop .vcf contact cards anywhere on this page.</td></tr>}
        </tbody>
      </table>
      <p className="muted small">Double-click empty space to add · drop .vcf cards to import · cast and crew here are the same people on call sheets (edit unavailable dates and daily crew in ⚙ Settings).</p>
    </div>
  );
}
