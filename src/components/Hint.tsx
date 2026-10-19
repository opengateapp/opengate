import { useTouch } from '../ui/responsive';

// Hints that mention the mouse ("double-click", "right-click") read differently on touch screens.

export function touchWording(s: string): string {
  return s
    .replace(/Double-click/g, 'Double-tap').replace(/double-click/g, 'double-tap')
    .replace(/Right-click/g, 'Long-press').replace(/right-click/g, 'long-press')
    .replace(/drag rows by ⋮⋮ to reorder/g, 'long-press a row to move it');
}

/** Renders a hint, reworded for touch screens. */
export function Hint({ children }: { children: string }) {
  const touch = useTouch();
  return <>{touch ? touchWording(children) : children}</>;
}

/** The same, for titles and other plain strings. */
export function useHintText(): (s: string) => string {
  const touch = useTouch();
  return (s) => (touch ? touchWording(s) : s);
}
