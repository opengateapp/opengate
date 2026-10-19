import type { Draft } from 'immer';
import type { BudgetLine, License, LicenseKind, LicenseStatus, Project } from '../model/types';
import { newId } from '../model/ids';
import { csv } from '../io/reports';

// Licenses & clearances: music, stock footage and the rest. Each license with a fee is a linked
// budget line; licensed music and footage feed the end credits and the music cue sheet.

export const LICENSE_KINDS: { id: LicenseKind; label: string; account: string }[] = [
  { id: 'music', label: 'Music', account: '4200' },
  { id: 'stock', label: 'Stock footage', account: '4600' },
  { id: 'archival', label: 'Archival footage', account: '4600' },
  { id: 'photo', label: 'Photo / artwork', account: '4600' },
  { id: 'font', label: 'Font', account: '4600' },
  { id: 'software', label: 'Software / plug-in', account: '4600' },
  { id: 'other', label: 'Other', account: '4600' },
];
export const kindLabel = (k: LicenseKind) => LICENSE_KINDS.find((x) => x.id === k)?.label ?? k;

export const STATUSES: { id: LicenseStatus; label: string }[] = [
  { id: 'needed', label: 'Needed' }, { id: 'requested', label: 'Requested' }, { id: 'quoted', label: 'Quoted' },
  { id: 'licensed', label: 'Licensed' }, { id: 'declined', label: 'Declined' },
];

export const LICENSE_TYPES = ['Sync + master', 'Sync only', 'Master only', 'Royalty-free', 'Rights-managed', 'Subscription', 'Creative Commons', 'Permission letter', 'Work for hire'];
export const MEDIA_OPTIONS = ['Festival', 'Online / streaming', 'Broadcast', 'Theatrical', 'All media'];
export const USE_TYPES = ['Background instrumental', 'Background vocal', 'Visual instrumental', 'Visual vocal', 'Main title', 'End title', 'Theme', 'Source (on screen)'];

export function newLicense(kind: LicenseKind = 'music'): License {
  return { id: newId(), kind, title: '', fee: 0, status: 'needed', sceneIds: [], inCredits: kind === 'music' || kind === 'stock' || kind === 'archival' || kind === 'photo' };
}

/** A credit line for a license, unless one has been typed. */
export function suggestedCredit(l: License): string {
  const t = l.title.trim();
  const by = (label: string, v?: string) => (v?.trim() ? `${label} ${v.trim()}` : '');
  if (l.kind === 'music') {
    return [t ? `“${t}”` : '', by('Written by', l.writers), by('Performed by', l.performer), by('Courtesy of', l.label || l.source), l.licenseType?.toLowerCase().includes('royalty') || l.licenseType?.toLowerCase().includes('subscription') ? by('Licensed via', l.source && l.source !== (l.label || l.source) ? l.source : '') : ''].filter(Boolean).join('\n');
  }
  if (l.kind === 'stock' || l.kind === 'archival') return [t, by(l.kind === 'archival' ? 'Archival footage courtesy of' : 'Footage courtesy of', l.source || l.label)].filter(Boolean).join(' — ');
  if (l.kind === 'photo') return [t, by('Courtesy of', l.source || l.performer)].filter(Boolean).join(' — ');
  return [t, by('by', l.source || l.performer)].filter(Boolean).join(' ');
}
export const creditLine = (l: License) => (l.credit?.trim() ? l.credit.trim() : suggestedCredit(l));

/** Keeps a linked budget line for every license with a fee (declined ones drop out). */
export function syncLicenseLines(d: Draft<Project>) {
  const lic = d.budget.licenses ?? [];
  const accountFor = (k: LicenseKind) => {
    const code = LICENSE_KINDS.find((x) => x.id === k)?.account ?? '4600';
    const found = d.budget.accounts.find((a) => a.code === code);
    if (found) return found.id;
    if (code === '4600') {
      // Budgets from before Licenses (or synced from an older copy) may not have the account yet.
      const acc = { id: 'acc-4600', code: '4600', name: 'Licensing & Clearances', group: 'post' as const };
      const at = d.budget.accounts.findIndex((a) => a.code > '4600');
      d.budget.accounts.splice(at < 0 ? d.budget.accounts.length : at, 0, acc);
      return acc.id;
    }
    return d.budget.accounts.find((a) => a.group === 'post')?.id ?? d.budget.accounts[0]?.id;
  };
  const wanted = (l: License) => l.fee > 0 && l.status !== 'declined';
  for (const l of lic) {
    const i = d.budget.lines.findIndex((x) => x.link?.kind === 'license' && x.link.id === l.id);
    if (!wanted(l)) { if (i >= 0) d.budget.lines.splice(i, 1); continue; }
    const want = { description: `${kindLabel(l.kind)} license: ${l.title || 'untitled'}${l.status === 'licensed' ? '' : ` (${l.status})`}`, units: 'flat' as const, x: 1, rate: l.fee };
    if (i >= 0) Object.assign(d.budget.lines[i], want, { link: { kind: 'license', id: l.id, auto: true } });
    else d.budget.lines.push({ id: newId(), accountId: accountFor(l.kind)!, qty: 1, fringeIds: [], ...want, link: { kind: 'license', id: l.id, auto: true } } as BudgetLine);
  }
  d.budget.lines = d.budget.lines.filter((x) => x.link?.kind !== 'license' || lic.some((l) => l.id === x.link!.id && wanted(l)));
}

/** Seconds between two timecodes (HH:MM:SS or HH:MM:SS:FF, frames ignored), or null. */
export function tcSeconds(tc?: string): number | null {
  const m = tc?.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})(?:[:;.](\d{2}))?$/) ?? tc?.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return m.length === 3 ? Number(m[1]) * 60 + Number(m[2]) : Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
export function duration(l: License): string {
  const a = tcSeconds(l.tcIn), b = tcSeconds(l.tcOut);
  if (a == null || b == null || b < a) return '';
  const s = b - a;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Music cue sheet (for broadcasters, festivals and performing-rights societies). */
export function cueSheetCsv(p: Project): string {
  const music = (p.budget.licenses ?? []).filter((l) => l.kind === 'music' && l.status !== 'declined');
  return csv([
    ['Cue', 'Title', 'Composer / writer(s)', 'Publisher(s)', 'Performer(s)', 'Label / master owner', 'Use', 'Timecode in', 'Timecode out', 'Duration', 'License #', 'Status'],
    ...music.map((l, i) => [String(i + 1).padStart(2, '0'), l.title, l.writers ?? '', l.publisher ?? '', l.performer ?? '', l.label ?? l.source ?? '', l.useType ?? '', l.tcIn ?? '', l.tcOut ?? '', duration(l), l.licenseNumber ?? '', l.status]),
  ]);
}

/** Every license with its terms and status. */
export function clearanceLogCsv(p: Project): string {
  return csv([
    ['Kind', 'Title', 'Performer', 'Writers', 'Publisher', 'Label / owner', 'Source', 'License type', 'License #', 'Media', 'Territory', 'Term', 'Start', 'Expires', 'Fee', 'Status', 'Credit line', 'Notes'],
    ...(p.budget.licenses ?? []).map((l) => [kindLabel(l.kind), l.title, l.performer ?? '', l.writers ?? '', l.publisher ?? '', l.label ?? '', l.source ?? '', l.licenseType ?? '', l.licenseNumber ?? '', l.media ?? '', l.territory ?? '', l.term ?? '', l.start ?? '', l.expires ?? '', String(l.fee), l.status, creditLine(l).replace(/\n/g, ' · '), l.notes ?? '']),
  ]);
}

/** Licenses that need attention: used but not cleared, or expiring within 60 days / already expired. */
export function licenseWarnings(p: Project, today = new Date().toISOString().slice(0, 10)): { id: string; text: string }[] {
  const soon = new Date(Date.parse(today) + 60 * 86400_000).toISOString().slice(0, 10);
  const out: { id: string; text: string }[] = [];
  for (const l of p.budget.licenses ?? []) {
    const name = l.title || kindLabel(l.kind);
    const used = l.sceneIds.length > 0 || !!l.tcIn;
    if (used && l.status !== 'licensed') out.push({ id: l.id, text: `“${name}” is in the cut but not licensed yet (${l.status}).` });
    if (l.status === 'licensed' && l.expires && l.expires < today) out.push({ id: l.id, text: `“${name}” license expired on ${l.expires}.` });
    else if (l.status === 'licensed' && l.expires && l.expires <= soon) out.push({ id: l.id, text: `“${name}” license expires on ${l.expires}.` });
  }
  return out;
}
