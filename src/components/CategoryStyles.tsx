import { useStore } from '../store/project';

/** Injects highlight colors for breakdown tags, one rule per category. */
export function CategoryStyles() {
  const cats = useStore((s) => s.project?.categories ?? []);
  const css = cats
    .map((c) => `.show-tags .tag.cat-${c.id}{background:${c.color}33;border-bottom:2px solid ${c.color};border-radius:2px}`)
    .join('\n');
  return <style>{css}</style>;
}
