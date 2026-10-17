import logoSvg from '../assets/open-gate-logo.svg?raw';

/**
 * The Open Gate logo, drawn in the logo color (Settings → Appearance; defaults to the text
 * color, so it's black in light mode and white in dark mode).
 */
export function Logo({ className = '', title = 'Open Gate' }: { className?: string; title?: string }) {
  return <span className={`og-logo ${className}`} title={title} dangerouslySetInnerHTML={{ __html: logoSvg }} />;
}
