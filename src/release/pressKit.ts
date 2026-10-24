import type { PressKit, Project } from '../model/types';
import type { Derived } from '../script/derive';
import { FORMATS } from '../tabs/storyboard/formats';
import { joinFestivals } from '../budget/festivals';

// Release → Press kit (EPK): what a festival programmer, journalist or distributor asks for, built
// from the project where it can be (title, logline, synopsis, cast and key crew, laurels, tech
// specs) and written for it where it can't (director's statement, bios, stills, contact).

export const emptyPressKit = (): PressKit => ({ stills: [], specs: {}, contact: {} });
export const pressKitOf = (p: Pick<Project, 'pressKit'>): PressKit => ({ ...emptyPressKit(), ...p.pressKit, specs: { ...p.pressKit?.specs }, contact: { ...p.pressKit?.contact } });

export interface PressPerson { key: string; name: string; role: string; character?: string; bio?: string; photoId?: string; hidden: boolean }
export interface PressSpec { label: string; value: string; auto: boolean }

/** Key crew for a press kit, in billing order (roles matched loosely). */
const KEY_ROLES: [RegExp, string][] = [
  [/^(?!.*assistant).*\bdirector\b(?!.*photograph)/i, 'Director'],
  [/writer|screenplay/i, 'Writer'],
  [/^(?!.*(line|associate|assistant)).*\bproducer\b/i, 'Producer'],
  [/director of photography|cinematograph|\bdp\b|\bdop\b/i, 'Director of Photography'],
  [/production design/i, 'Production Designer'],
  [/\beditor\b/i, 'Editor'],
  [/composer|original music/i, 'Composer'],
  [/sound design/i, 'Sound Designer'],
];

/** The people in the press kit: key crew, then cast in cast-number order. */
export function pressPeople(p: Project): PressPerson[] {
  const kit = pressKitOf(p);
  const hidden = new Set(kit.hidden ?? []);
  const out: PressPerson[] = [];
  const add = (key: string, name: string, role: string, character?: string) => {
    if (!name.trim() || out.some((x) => x.key === key)) return;
    out.push({ key, name: name.trim(), role, character, bio: kit.bios?.[key], photoId: kit.photos?.[key], hidden: hidden.has(key) });
  };
  for (const [re, label] of KEY_ROLES) for (const c of p.crew.filter((x) => re.test(x.role))) add(`crew:${c.id}`, c.name, c.role || label);
  // A director or producer typed only in Production info.
  if (!out.some((x) => /director$/i.test(x.role)) && p.production.director) add('prod:director', p.production.director, 'Director');
  if (!out.some((x) => /producer/i.test(x.role)) && p.production.producer) add('prod:producer', p.production.producer, 'Producer');
  for (const c of [...p.cast].sort((a, b) => a.castNumber - b.castNumber)) add(`cast:${c.id}`, c.actorName, 'Cast', titleCase(c.characterName));
  return out;
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** Laurels earned at accepted festivals, newest first: "Official Selection — Prairie Light Film Festival 2027". */
export function laurels(p: Project): { text: string; festival: string; year?: string }[] {
  return joinFestivals(p)
    .filter((f) => f.status === 'accepted')
    .sort((a, b) => (b.eventStart ?? '').localeCompare(a.eventStart ?? ''))
    .map((f) => ({ text: f.laurel || 'Official Selection', festival: f.name.replace(/\s*\(fictional\)\s*$/i, ''), year: f.eventStart?.slice(0, 4) }));
}

/** Tech specs: what you typed, else what the project knows (marked auto). */
export function pressSpecs(p: Project, d: Derived): PressSpec[] {
  const s = pressKitOf(p).specs;
  const fmt = FORMATS.find((f) => f.id === (p.storyboardSettings?.format ?? '16:9'));
  // "Sony a7S III kit (camera, 3 lenses, media)" → "Sony a7S III".
  const camera = (p.gear ?? []).find((g) => g.category === 'camera')?.name.replace(/\s*\(.*\)\s*$/, '').replace(/\s+(kit|package|body)$/i, '').trim();
  const minutes = Math.max(1, Math.round(d.pageCount));
  const genre = p.bible?.genre && p.bible.genre !== 'contemporary' ? titleCase(p.bible.genre === 'scifi' ? 'Science fiction' : p.bible.genre) : undefined;
  const rows: [string, string | undefined, string | undefined][] = [
    ['Runtime', s.runtime, `about ${minutes} min`],
    ['Genre', s.genre, genre],
    ['Aspect ratio', s.aspect, fmt ? fmt.short.replace('2.39', '2.39:1') : undefined],
    ['Shot on', s.camera, camera],
    ['Sound', s.sound, undefined],
    ['Colour', s.color, undefined],
    ['Language', s.language, undefined],
    ['Country', s.country, undefined],
    ['Year', s.year, undefined],
  ];
  return rows.filter(([, typed, auto]) => typed?.trim() || auto).map(([label, typed, auto]) => ({ label, value: (typed?.trim() || auto)!, auto: !typed?.trim() }));
}

export interface PressKitView {
  title: string;
  logline: string;
  shortSynopsis: string;
  longSynopsis: string;
  directorStatement: string;
  people: PressPerson[];
  laurels: ReturnType<typeof laurels>;
  specs: PressSpec[];
  stills: string[];
  posterId?: string;
  trailerUrl?: string;
  website?: string;
  contact: PressKit['contact'];
  /** What a programmer will look for that's still empty. */
  missing: string[];
}

/** Everything that goes into the PDF and the one-page site. */
export function pressKitView(p: Project, d: Derived): PressKitView {
  const k = pressKitOf(p);
  const v: PressKitView = {
    title: p.titlePage.title || p.title,
    logline: (k.logline?.trim() || p.bible?.logline || '').trim(),
    shortSynopsis: (k.shortSynopsis ?? '').trim(),
    longSynopsis: (k.longSynopsis?.trim() || p.bible?.synopsis || '').trim(),
    directorStatement: (k.directorStatement ?? '').trim(),
    people: pressPeople(p).filter((x) => !x.hidden),
    laurels: laurels(p),
    specs: pressSpecs(p, d),
    stills: k.stills,
    posterId: k.posterId,
    trailerUrl: k.trailerUrl,
    website: k.website,
    contact: k.contact,
    missing: [],
  };
  const miss = (cond: boolean, what: string) => { if (cond) v.missing.push(what); };
  miss(!v.logline, 'a logline');
  miss(!v.shortSynopsis && !v.longSynopsis, 'a synopsis');
  miss(!v.directorStatement, 'a director’s statement');
  miss(!v.stills.length, 'stills');
  miss(!v.posterId, 'a poster');
  miss(!v.contact.email && !v.contact.phone, 'a press contact');
  return v;
}

// ---------------------------------------------------------------- the one-page website

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const paras = (s: string) => s.split(/\n{2,}|\n/).filter((x) => x.trim()).map((x) => `<p>${esc(x.trim())}</p>`).join('');
const safeUrl = (u?: string) => (u && /^https?:\/\//i.test(u.trim()) ? u.trim() : undefined);

/** A single self-contained HTML page (images inlined) to host anywhere for free. */
export function pressKitHtml(v: PressKitView, images: Map<string, string>): string {
  const img = (id?: string) => (id ? images.get(id) : undefined);
  const poster = img(v.posterId);
  const trailer = safeUrl(v.trailerUrl);
  const site = safeUrl(v.website);
  const crew = v.people.filter((x) => x.role !== 'Cast');
  const cast = v.people.filter((x) => x.role === 'Cast');
  const person = (x: PressPerson) => `<div class="person">${img(x.photoId) ? `<img src="${img(x.photoId)}" alt="${esc(x.name)}">` : ''}<div><b>${esc(x.name)}</b><span>${esc(x.character ? `as ${x.character}` : x.role)}</span>${x.bio ? paras(x.bio) : ''}</div></div>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(v.title)} — press kit</title>
<style>
:root{--bg:#fff;--fg:#141414;--muted:#666;--line:#e3e3e3;--accent:#b4541a}
@media (prefers-color-scheme:dark){:root{--bg:#121212;--fg:#eee;--muted:#9a9a9a;--line:#2c2c2c;--accent:#f0a060}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:920px;margin:0 auto;padding:32px 16px 64px}h1{font-size:clamp(32px,6vw,56px);line-height:1.05;margin:0 0 8px}
h2{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:40px 0 12px;border-top:1px solid var(--line);padding-top:16px}
.logline{font-size:20px;margin:0 0 16px}.hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:24px;align-items:start}
.hero img{width:100%;border-radius:6px}.laurels{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}.laurels span{border:1px solid var(--line);border-radius:999px;padding:4px 12px;font-size:13px}
.stills{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px}.stills img{width:100%;border-radius:4px}
.person{display:flex;gap:12px;margin:0 0 16px}.person img{width:72px;height:72px;object-fit:cover;border-radius:50%}.person span{display:block;color:var(--muted);font-size:14px}.person p{margin:4px 0 0;font-size:15px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:0}dt{color:var(--muted)}dd{margin:0}a{color:var(--accent)}
footer{margin-top:48px;color:var(--muted);font-size:13px}
@media (max-width:640px){.hero{grid-template-columns:1fr}}
</style></head><body><main>
<div class="hero">${poster ? `<img src="${poster}" alt="Poster: ${esc(v.title)}">` : '<div></div>'}<div>
<h1>${esc(v.title)}</h1>
${v.logline ? `<p class="logline">${esc(v.logline)}</p>` : ''}
${v.laurels.length ? `<div class="laurels">${v.laurels.map((l) => `<span>${esc(l.text)} · ${esc(l.festival)}${l.year ? ` ${l.year}` : ''}</span>`).join('')}</div>` : ''}
${trailer ? `<p><a href="${esc(trailer)}" rel="noopener">▶ Watch the trailer</a></p>` : ''}
${v.shortSynopsis ? paras(v.shortSynopsis) : ''}
</div></div>
${v.longSynopsis ? `<h2>Synopsis</h2>${paras(v.longSynopsis)}` : ''}
${v.directorStatement ? `<h2>Director’s statement</h2>${paras(v.directorStatement)}` : ''}
${v.stills.some((id) => img(id)) ? `<h2>Stills</h2><div class="stills">${v.stills.filter((id) => img(id)).map((id, i) => `<img src="${img(id)}" alt="Still ${i + 1}" loading="lazy">`).join('')}</div>` : ''}
${crew.length ? `<h2>Filmmakers</h2>${crew.map(person).join('')}` : ''}
${cast.length ? `<h2>Cast</h2>${cast.map(person).join('')}` : ''}
${v.specs.length ? `<h2>Technical details</h2><dl>${v.specs.map((s) => `<dt>${esc(s.label)}</dt><dd>${esc(s.value)}</dd>`).join('')}</dl>` : ''}
${v.contact.name || v.contact.email || v.contact.phone || site ? `<h2>Contact</h2><p>${[v.contact.name && esc(v.contact.name), v.contact.email && `<a href="mailto:${esc(v.contact.email)}">${esc(v.contact.email)}</a>`, v.contact.phone && esc(v.contact.phone), site && `<a href="${esc(site)}" rel="noopener">${esc(site.replace(/^https?:\/\//, ''))}</a>`].filter(Boolean).join('<br>')}</p>` : ''}
<footer>Press kit made with Open Gate.</footer>
</main></body></html>
`;
}
