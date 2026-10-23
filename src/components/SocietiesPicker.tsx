import { useProject } from '../store/project';
import { societyOptions, type Societied } from '../paperwork/societies';
import { openActions } from './ActionSheet';
import { askConfirm } from './dialogs';
import { RefLink } from '../tabs/ReferenceTab';
import { guildById } from '../reference/guilds';

/** Honorary societies for one person: chips (ASC, ACE…) plus an add menu. PGA asks about certification first. */
export function SocietiesPicker({ value, onChange, ro }: { value: Societied; onChange: (patch: Societied) => void; ro?: boolean }) {
  const p = useProject();
  const all = societyOptions(p, true);
  const mine = value.societies ?? [];
  const label = (id: string) => {
    const s = all.find((x) => x.id === id);
    if (!s) return id;
    return s.id === 'pga' ? (value.pgaCertified ? 'p.g.a.' : 'PGA (not certified)') : s.abbr;
  };
  const add = async (id: string) => {
    if (id === 'pga') {
      const ok = await askConfirm('Certified by the PGA for this production?', {
        message: 'The p.g.a. mark goes after a producer’s name only when the Producers Guild has certified their credit on this production. Earlier films don’t count. Choose Cancel to note PGA membership without the mark.',
        confirmLabel: 'Yes, certified',
      });
      onChange({ societies: [...mine, id], pgaCertified: ok || undefined });
    } else onChange({ societies: [...mine, id] });
  };
  const menu = (at: { x: number; y: number }) => {
    const groups = [...new Set(societyOptions(p).map((s) => s.craft))];
    openActions('Add a society', groups.flatMap((g) => societyOptions(p).filter((s) => s.craft === g && !mine.includes(s.id)).map((s) => ({ label: `${s.abbr} — ${s.name}`, run: () => void add(s.id) }))), at);
  };
  return (
    <span className="societies-picker">
      {mine.map((id) => (
        <span key={id} className="chip small society-chip" title={all.find((x) => x.id === id)?.name}>
          {label(id)}
          {!ro && <button className="icon-btn" aria-label={`Remove ${label(id)}`} onClick={() => onChange({ societies: mine.filter((x) => x !== id).length ? mine.filter((x) => x !== id) : undefined, ...(id === 'pga' ? { pgaCertified: undefined } : {}) })}>×</button>}
        </span>
      ))}
      {!ro && <button className="small society-add" onClick={(e) => menu({ x: e.clientX, y: e.clientY })} title="Honorary societies (letters after the name in credits)">＋ Society</button>}
      {mine.length > 0 && <RefLink page={mine.length === 1 && guildById(mine[0]) ? `guild-${mine[0]}` : 'guild-unions-vs-societies'} />}
    </span>
  );
}
