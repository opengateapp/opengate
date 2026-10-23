// Dev-only: finds text that runs past its button, menu, dialog or the screen on the current page.
// In the browser console (npm run dev): opengateAudit() — open a menu or dialog first to check it.
// Not loaded in production builds.

const HOSTS = 'button, label, .chip, .card, .tool-card, .template-card, .license-card, .person-card, .menu, .more-menu, .action-sheet, .modal, .section-flyout, td, th, li, .field';

export interface OverflowIssue { why: 'spills' | 'offscreen' | 'overlaps'; host: string; text: string; el: Element }

export function overflowAudit(root: ParentNode = document): OverflowIssue[] {
  const out: OverflowIssue[] = [];
  const seen = new Set<string>();
  for (const el of root.querySelectorAll('*')) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || !el.getClientRects().length) continue;
    const host = el.parentElement?.closest(HOSTS);
    if (!host) continue;
    const hcs = getComputedStyle(host);
    // Scrolling containers and deliberate "…" truncation are fine.
    if (hcs.overflowX === 'auto' || hcs.overflowX === 'scroll' || el.closest('.table-scroll')) continue;
    if (cs.textOverflow === 'ellipsis' || hcs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none' && cs.webkitLineClamp) continue;
    const range = document.createRange();
    range.selectNodeContents(el);
    const tr = range.getBoundingClientRect();
    const hr = host.getBoundingClientRect();
    const why = tr.right > innerWidth + 1 ? 'offscreen' : tr.right > hr.right + 2 ? 'spills' : null;
    if (!why) continue;
    const text = (el.textContent ?? '').trim().slice(0, 60);
    const hostName = `${host.tagName.toLowerCase()}${host.classList[0] ? '.' + host.classList[0] : ''}`;
    const key = `${why}|${hostName}|${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ why, host: hostName, text, el });
  }
  // Menu rows squeezed on top of each other (a flex column that's too short).
  for (const menu of root.querySelectorAll('.menu, .more-menu, .action-sheet')) {
    const rows = [...menu.children].filter((c) => c.getClientRects().length);
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].getBoundingClientRect().top < rows[i - 1].getBoundingClientRect().bottom - 1) {
        out.push({ why: 'overlaps', host: `${menu.tagName.toLowerCase()}.${menu.classList[0]}`, text: (rows[i].textContent ?? '').trim().slice(0, 60), el: rows[i] });
      }
    }
  }
  return out;
}

export function installOverflowAudit() {
  (window as unknown as { opengateAudit: () => OverflowIssue[] }).opengateAudit = () => {
    const issues = overflowAudit();
    console.table(issues.map(({ why, host, text }) => ({ why, host, text })));
    return issues;
  };
}
