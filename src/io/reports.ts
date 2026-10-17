import type { Project, Shot } from '../model/types';
import { sceneCast, sceneEighths, sceneElements, type Derived } from '../script/derive';
import { formatEighths } from '../model/dates';
import { SHOT_TYPES } from '../model/defaults';

export function csv(rows: (string | number | undefined | null)[][]): string {
  return rows
    .map((r) => r.map((c) => {
      const s = c == null ? '' : String(c);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\r\n') + '\r\n';
}

export function breakdownCsv(p: Project, d: Derived): string {
  const cats = p.categories.filter((c) => c.id !== 'cast');
  const header = ['Scene', 'Heading', 'INT/EXT', 'Set', 'Time', 'Pages', 'Page #', 'Synopsis', 'Cast', ...cats.map((c) => c.name)];
  const rows = d.scenes.map((s) => {
    const els = sceneElements(p, s);
    return [
      s.number, s.heading, s.intExt, s.set, s.time, formatEighths(sceneEighths(p, s)), s.startPage,
      p.sceneMeta[s.id]?.synopsis || s.firstAction,
      sceneCast(p, s).join('; '),
      ...cats.map((c) => els.filter((e) => e.categoryId === c.id).map((e) => e.name).join('; ')),
    ];
  });
  return csv([header, ...rows]);
}

export const SHOT_COLUMNS: [keyof Shot | 'scene' | '#', string][] = [
  ['#', '#'], ['scene', 'Scene'], ['shotNumber', 'Shot #'], ['setup', 'Setup'], ['name', 'Description'], ['subject', 'Subject'],
  ['shotType', 'Shot Type'], ['angle', 'Angle'], ['lens', 'Lens'], ['move', 'Movement'], ['equipment', 'Equipment'],
  ['focus', 'Focus'], ['lighting', 'Lighting'], ['sound', 'Sound'], ['vfx', 'VFX / SFX'], ['action', 'Action'],
  ['duration', 'Est. Duration'], ['priority', 'Priority'], ['notes', 'Notes'], ['quote', 'Script Text'],
];

export function sortedShots(p: Project, d: Derived): Shot[] {
  const order = new Map(d.scenes.map((s) => [s.id, s.index]));
  return [...p.shots].sort((a, b) => (order.get(a.sceneId ?? '') ?? 1e9) - (order.get(b.sceneId ?? '') ?? 1e9) || a.order - b.order);
}

export function shotRows(p: Project, d: Derived): (string | number)[][] {
  return sortedShots(p, d).map((s, i) => SHOT_COLUMNS.map(([k]) => {
    if (k === '#') return i + 1;
    if (k === 'scene') return s.sceneId ? d.sceneById.get(s.sceneId)?.number ?? '?' : '';
    if (k === 'shotType') return SHOT_TYPES.find((t) => t.code === s.shotType)?.label ?? s.shotType;
    return String(s[k] ?? '');
  }));
}

export function shotListCsv(p: Project, d: Derived): string {
  return csv([SHOT_COLUMNS.map(([, l]) => l), ...shotRows(p, d)]);
}

export async function shotListXlsx(p: Project, d: Derived): Promise<Blob> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([SHOT_COLUMNS.map(([, l]) => l), ...shotRows(p, d)]);
  ws['!cols'] = SHOT_COLUMNS.map(([k]) => ({ wch: k === 'name' || k === 'notes' || k === 'quote' || k === 'action' ? 36 : k === '#' ? 4 : 14 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Shot List');
  const byScene = d.scenes.map((s) => {
    const shots = p.shots.filter((x) => x.sceneId === s.id);
    return [s.number, s.heading, shots.length, shots.map((x) => x.name || x.shotType).join(' / ')];
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Scene', 'Heading', 'Shots', 'Descriptions'], ...byScene]), 'By Scene');
  const counts = new Map<string, number>();
  p.shots.forEach((s) => counts.set(s.shotType || '—', (counts.get(s.shotType || '—') ?? 0) + 1));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Generated', new Date().toLocaleString()], ['Total shots', p.shots.length], [], ['Shot type', 'Count'], ...counts.entries()]), 'Summary');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
