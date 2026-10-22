import { useProject } from '../store/project';
import type { UnionStatus } from '../model/types';
import { UNION_STATUSES, unionOptions, type Unioned } from '../paperwork/unions';

/** Union, status and local for one person. `compact` shows just the union dropdown until one is picked. */
export function UnionPicker({ value, onChange, ro, compact }: { value: Unioned; onChange: (patch: Unioned) => void; ro?: boolean; compact?: boolean }) {
  const p = useProject();
  const list = unionOptions(p);
  const groups = [...new Set(list.map((u) => u.group))];
  const current = list.find((u) => u.name === value.union);
  const known = !value.union || !!current || unionOptions(p, true).some((u) => u.name === value.union);
  return (
    <span className="union-picker">
      <select disabled={ro} aria-label="Union" value={value.union ?? ''} onChange={(e) => {
        const v = e.target.value;
        onChange(v ? { union: v, unionStatus: value.unionStatus && value.unionStatus !== 'nonunion' ? value.unionStatus : 'member' } : { union: undefined, unionStatus: undefined, unionLocal: undefined });
      }}>
        <option value="">No union</option>
        {!known && <option value={value.union}>{value.union}</option>}
        {groups.map((g) => <optgroup key={g} label={g}>{list.filter((u) => u.group === g).map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}</optgroup>)}
      </select>
      {value.union && (!compact || value.unionStatus !== 'member' || current?.locals) && (
        <>
          <select disabled={ro} aria-label="Union status" value={value.unionStatus ?? 'member'} onChange={(e) => onChange({ unionStatus: e.target.value as UnionStatus })}>
            {UNION_STATUSES.filter((s) => s.id !== 'nonunion').map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          {(current?.locals?.length || value.unionLocal || !compact) && (
            <input disabled={ro} className="union-local" aria-label="Local" placeholder="Local" list={`locals-${current?.id ?? 'x'}`} value={value.unionLocal ?? ''} onChange={(e) => onChange({ unionLocal: e.target.value || undefined })} />
          )}
          {current?.locals && <datalist id={`locals-${current.id}`}>{current.locals.map((l) => <option key={l} value={l} />)}</datalist>}
        </>
      )}
    </span>
  );
}
