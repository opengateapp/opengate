import type { Project } from '../model/types';
import type { Derived } from '../script/derive';

// Feedback goes to GitHub issue forms (.github/ISSUE_TEMPLATE/) on opengateapp/opengate, filled in
// with the app version, browser, system, screen size and tab. Never project content: no names,
// titles or text. Fields are filled from the link by their form ids (GitHub's form schema).

export const REPO = 'https://github.com/opengateapp/opengate';
export type IssueKind = 'bug' | 'feature' | 'question' | 'resource';
const TEMPLATE: Record<IssueKind, string> = { bug: 'bug.yml', feature: 'feature.yml', question: 'question.yml', resource: 'resource.yml' };

function browser(ua: string): string {
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Other browser';
}
function system(ua: string): string {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Other system';
}

/** What the feedback form is filled in with. Nothing from the project. */
export function appContext(tab?: string): { version: string; environment: string; tab?: string } {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const w = typeof window !== 'undefined' ? window.innerWidth : 0;
  const size = w <= 760 ? 'phone size' : w <= 1100 ? 'tablet size' : 'desktop size';
  const desktop = typeof window !== 'undefined' && '__TAURI__' in window ? 'desktop app' : 'web';
  return { version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev', environment: `${desktop} · ${browser(ua)} · ${system(ua)} · ${size}`, tab };
}

/** A GitHub "new issue" link that opens the right form, filled in. */
export function issueUrl(kind: IssueKind, tab?: string): string {
  const c = appContext(tab);
  const q = new URLSearchParams({ template: TEMPLATE[kind] });
  if (kind !== 'resource') { q.set('version', c.version); q.set('environment', c.environment); }
  if (kind === 'bug' && tab) q.set('tab', tab);
  return `${REPO}/issues/new?${q.toString()}`;
}

/** Counts only, for a bug that involves your project: no names, titles or text. */
export function safeSummary(p: Project, d: Derived): string {
  const days = p.schedule.days.filter((x) => x.items.some((i) => i.kind === 'scene')).length;
  return [
    `Open Gate ${appContext().environment}, version ${appContext().version}`,
    `Scenes: ${d.scenes.length} · pages: ${d.pageCount.toFixed(1)} · speaking roles: ${d.characters.length}`,
    `Cast: ${p.cast.length} · crew: ${p.crew.length} · contacts: ${p.contacts.length} · locations: ${p.locations.length}`,
    `Shoot days: ${days} · shots: ${p.shots.length} · storyboard frames: ${p.storyboard.length}`,
    `Budget lines: ${p.budget.lines.length} · versions: ${p.budget.scenarios.length} · festivals: ${(p.festivals ?? []).length} · social posts: ${(p.socialPosts ?? []).length}`,
    `Shared: ${p.share ? 'yes' : 'no'}`,
  ].join('\n');
}
