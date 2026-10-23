import { useProject, useStore } from '../../store/project';
import type { StoryboardSettings } from '../../model/types';
import { DEFAULT_FORMAT, FORMATS, GUIDE_COLORS, formatOf, guideRect } from './formats';

/** Format for every storyboard panel, extra frame guides, and whether guides print. */
export function FramingControls({ beforeChange }: { beforeChange?: () => Promise<void> | void }) {
  const p = useProject();
  const update = useStore((s) => s.update);
  const s = p.storyboardSettings;
  const fmt = formatOf(s);
  const set = async (patch: Partial<StoryboardSettings> | ((cur: StoryboardSettings | undefined) => Partial<StoryboardSettings>)) => {
    await beforeChange?.();
    // Work from the latest saved settings, so quick successive clicks don't overwrite each other.
    update((dr) => { const cur = dr.storyboardSettings as StoryboardSettings | undefined; dr.storyboardSettings = { perPage: 2, showReference: true, ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) }; }, 'Storyboard framing');
  };
  const toggleGuide = (id: string) => set((cur) => { const list = (cur?.guides ?? []).filter((g) => g !== formatOf(cur).id); return { guides: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] }; });
  const chosen = (s?.guides ?? []).filter((g) => g !== fmt.id);
  return (
    <div className="fe-opt keep-open">
      <span className="fe-opt-h">Format (every panel)</span>
      <select value={fmt.id} aria-label="Format" onChange={(e) => { const v = e.target.value; void set((cur) => ({ format: v === DEFAULT_FORMAT ? undefined : v, guides: (cur?.guides ?? []).filter((g) => g !== v) })); }}>
        {[...new Set(FORMATS.map((f) => f.group))].map((g) => <optgroup key={g} label={g}>{FORMATS.filter((f) => f.group === g).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</optgroup>)}
      </select>
      <span className="muted small">{fmt.note}. Panels, drawing and the PDF use this shape; existing drawings are fitted in.</span>
      <span className="fe-opt-h">Frame guides (protect for)</span>
      <div className="fe-guides">
        {FORMATS.filter((f) => f.id !== fmt.id).map((f) => {
          const on = chosen.includes(f.id);
          const color = on ? GUIDE_COLORS[chosen.indexOf(f.id) % GUIDE_COLORS.length] : undefined;
          return (
            <label key={f.id} className="check small" title={f.note}>
              <input type="checkbox" checked={on} onChange={() => void toggleGuide(f.id)} />
              <span style={color ? { color, fontWeight: 600 } : undefined}>{f.short}</span>
            </label>
          );
        })}
      </div>
      {chosen.length > 0 && (
        <label className="check small"><input type="checkbox" checked={s?.guidesInPrint !== false} onChange={(e) => void set({ guidesInPrint: e.target.checked ? undefined : false })} /> Show guides on the panels and in the PDF</label>
      )}
    </div>
  );
}

/** Frame guides over a panel thumbnail (SVG, so it scales with the panel). */
export function GuideOverlay({ ratio, ids }: { ratio: number; ids: string[] }) {
  if (!ids.length) return null;
  const W = 1000, H = Math.round(1000 / ratio);
  return (
    <svg className="guide-overlay" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      {ids.map((id, i) => {
        const f = FORMATS.find((x) => x.id === id);
        if (!f) return null;
        const r = guideRect(W, H, f.ratio);
        const c = GUIDE_COLORS[i % GUIDE_COLORS.length];
        return (
          <g key={id}>
            <rect x={r.x + 2} y={r.y + 2} width={r.w - 4} height={r.h - 4} fill="none" stroke={c} strokeWidth={3} strokeDasharray="14 9" vectorEffect="non-scaling-stroke" />
            <text x={r.x + 10} y={r.y + 30} fill={c} fontSize={Math.max(18, W * 0.022)} fontWeight={600} fontFamily="Inter, system-ui, sans-serif">{f.short}</text>
          </g>
        );
      })}
    </svg>
  );
}
