import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store/project';
import { currencyParts, formatDuration, formatNumber, parseDuration, parseNumber, unitsOf } from '../model/units';
import type { ProjectUnits } from '../model/types';

// Number boxes with their unit locked inside: "$ [387] /day", "[10] %", "[35] mm". Typing accepts
// "1200", "1,200.50" or a pasted "$1,200"; the number shows with separators when you're not typing.

/** The open project's units (or defaults when nothing is open). */
export function useUnits(): ProjectUnits {
  const p = useStore((s) => s.project);
  return useMemo(() => unitsOf(p), [p?.units, p?.budget?.currency]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** A box with a locked prefix and/or suffix; clicking the unit focuses the number. */
export function Affixed({ prefix, suffix, children, className, disabled }: { prefix?: ReactNode; suffix?: ReactNode; children: ReactNode; className?: string; disabled?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  if (prefix == null && suffix == null) return <>{children}</>;
  const focus = (e: React.MouseEvent) => { e.preventDefault(); ref.current?.querySelector('input')?.focus(); };
  return (
    <span ref={ref} className={`num-in ${disabled ? 'disabled' : ''} ${className ?? ''}`}>
      {prefix != null && <span className="num-affix pre" aria-hidden onMouseDown={focus}>{prefix}</span>}
      {children}
      {suffix != null && <span className="num-affix suf" aria-hidden onMouseDown={focus}>{suffix}</span>}
    </span>
  );
}

export interface NumberInputProps {
  value: number | null | undefined;
  /** Called while typing with each valid number; undefined when the box is emptied. */
  onChange: (n: number | undefined) => void;
  prefix?: ReactNode;
  suffix?: ReactNode;
  /** Most decimals to show (default 2). */
  decimals?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Class on the box around the input and its unit. */
  boxClassName?: string;
  title?: string;
  id?: string;
  'aria-label'?: string;
  /** Show thousands separators when not typing (default on). */
  grouping?: boolean;
}

export function NumberInput({ value, onChange, prefix, suffix, decimals = 2, min, max, disabled, placeholder, className, boxClassName, title, id, grouping = true, ...rest }: NumberInputProps) {
  const { locale } = useUnits();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value == null || !Number.isFinite(value) ? '' : grouping ? formatNumber(value, locale, decimals) : String(Math.round(value * 10 ** decimals) / 10 ** decimals));
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const input = (
    <input className={className} inputMode="decimal" disabled={disabled} placeholder={placeholder} title={title} id={id} aria-label={rest['aria-label']}
      value={shown}
      onFocus={(e) => { setDraft(value == null || !Number.isFinite(value) ? '' : String(Math.round(value * 10 ** decimals) / 10 ** decimals)); requestAnimationFrame(() => e.target.select()); }}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseNumber(e.target.value, locale);
        if (n === undefined) onChange(undefined);
        else if (!Number.isNaN(n)) onChange(clamp(n));
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const n = clamp((Number.isFinite(value) ? value! : 0) + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
        setDraft(String(n));
        onChange(n);
      }} />
  );
  return <Affixed prefix={prefix} suffix={suffix} className={boxClassName} disabled={disabled}>{input}</Affixed>;
}

/** Rates: "/day", "/week", "/hour", "/½ h", "each", "flat". */
export type Per = 'day' | 'week' | 'hour' | 'halfhour' | 'each' | 'flat' | 'month';
export const PER_LABEL: Record<Per, string> = { day: '/day', week: '/week', hour: '/hour', halfhour: '/½ h', each: 'each', flat: 'flat', month: '/month' };

/** Money in the project currency: "$ [387] /day", "[20] €". */
export function MoneyInput({ per, suffix, ...props }: Omit<NumberInputProps, 'prefix'> & { per?: Per }) {
  const { currency, locale, symbolStyle } = useUnits();
  const c = useMemo(() => currencyParts(currency, locale, symbolStyle), [currency, locale, symbolStyle]);
  const after = [c.side === 'suffix' ? c.symbol : null, per ? PER_LABEL[per] : null, suffix].filter((x) => x != null && x !== '');
  return <NumberInput {...props} decimals={props.decimals ?? c.decimals} prefix={c.side === 'prefix' ? c.symbol : undefined} suffix={after.length ? after.join(' ') : undefined} />;
}

/** The currency symbol and side, for boxes that aren't NumberInputs (formula boxes). */
export function useCurrencyAffix(): { prefix?: string; suffix?: string } {
  const { currency, locale, symbolStyle } = useUnits();
  return useMemo(() => { const c = currencyParts(currency, locale, symbolStyle); return c.side === 'prefix' ? { prefix: c.symbol } : { suffix: c.symbol }; }, [currency, locale, symbolStyle]);
}

/** A duration typed as "0:12", "12" or "1m 5s", shown as m:ss once you leave the box. Stored as text. */
export function DurationInput({ value, onChange, className, placeholder = '0:12', disabled, compact }: { value: string; onChange: (v: string) => void; className?: string; placeholder?: string; disabled?: boolean; /** In tight tables: "m:ss" as the placeholder instead of a label. */ compact?: boolean }) {
  const input = (
    <input className={compact ? className : undefined} value={value} placeholder={compact ? 'm:ss' : placeholder} title="Minutes:seconds, e.g. 0:12" disabled={disabled} inputMode="numeric"
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => { const s = parseDuration(e.target.value); if (s != null) onChange(formatDuration(s)); }} />
  );
  return compact ? input : <Affixed suffix="m:ss" disabled={disabled} className={className}>{input}</Affixed>;
}

const MM = /^(\d+(?:\.\d+)?)\s*mm$/i;
/** A lens: a common focal length, any other in mm, or typed ("24-70 zoom"). Stored as text ("35mm"). */
export function LensInput({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const mm = value.match(MM);
  const listed = options.includes(value);
  const [typing, setTyping] = useState(!!value && !listed && !mm);
  const pick = listed ? value : mm ? '__mm' : typing ? '__text' : '';
  return (
    <span className="row nowrap lens-in">
      <select value={pick} aria-label="Lens" onChange={(e) => {
        const v = e.target.value;
        if (v === '__mm') { setTyping(false); onChange(mm ? value : '60mm'); }
        else if (v === '__text') { setTyping(true); onChange(''); }
        else { setTyping(false); onChange(v); }
      }}>
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value="__mm">Other focal length…</option>
        <option value="__text">Other (type it)…</option>
      </select>
      {pick === '__mm' && <NumberInput className="cell-num small" suffix="mm" min={1} decimals={1} grouping={false} value={Number(mm?.[1] ?? 60)} aria-label="Focal length" onChange={(n) => n && onChange(`${n}mm`)} />}
      {pick === '__text' && <input className="w-sm" value={value} placeholder="24-70 zoom" aria-label="Lens" onChange={(e) => onChange(e.target.value)} />}
    </span>
  );
}
