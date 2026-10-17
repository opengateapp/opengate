import type { ScriptLine, TitlePage } from '../model/types';

// Fountain (https://fountain.io) import/export. Rules follow the spec and
// CineSched's FountainParser: forced elements, title page, dual dialogue (^),
// scene numbers (#12A#), boneyard /* */ and notes [[ ]] removed, sections/synopses skipped.

export interface ParsedScript {
  lines: ScriptLine[];
  titlePage?: Partial<TitlePage>;
  warnings: string[];
}

const HEADING = /^(INT\.?\/EXT|EXT\.?\/INT|INT|EXT|EST|I\/E)[.\s]/i;
const TITLE_KEY = /^([A-Za-z][A-Za-z ]*?):\s*(.*)$/;

function stripEmphasis(s: string): string {
  return s
    .replace(/\\\*/g, '\u0001')
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
    .replace(/(^|[^\w])_([^_]+)_(?=[^\w]|$)/g, '$1$2')
    .replace(/\u0001/g, '*');
}

function isAllCaps(s: string): boolean {
  const core = s.replace(/\([^)]*\)/g, '').replace(/\^$/, '');
  return /[A-Z]/.test(core) && core === core.toUpperCase();
}

export function parseFountain(src: string): ParsedScript {
  let text = src.replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
  // Remove boneyard and notes but keep line structure.
  text = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''));
  text = text.replace(/\[\[[\s\S]*?\]\]/g, (m) => (m.includes('\n') ? m.replace(/[^\n]/g, '') : ''));
  const raw = text.split('\n');
  const warnings: string[] = [];
  let i = 0;

  // Title page: starts with Key: value on the first line.
  let titlePage: Partial<TitlePage> | undefined;
  if (raw.length && TITLE_KEY.test(raw[0]) && !isAllCaps(raw[0].split(':')[0]) ) {
    titlePage = {};
    let key = '';
    const vals: Record<string, string[]> = {};
    for (; i < raw.length && raw[i].trim() !== ''; i++) {
      const m = raw[i].match(TITLE_KEY);
      if (m && !/^\s/.test(raw[i])) {
        key = m[1].toLowerCase();
        vals[key] = m[2] ? [m[2]] : [];
      } else if (key) {
        vals[key].push(raw[i].trim());
      }
    }
    const get = (k: string) => (vals[k] ?? []).map(stripEmphasis).join('\n').trim();
    titlePage = {
      title: get('title'),
      credit: get('credit'),
      author: get('author') || get('authors'),
      source: get('source'),
      draftDate: get('draft date') || get('date'),
      contact: get('contact'),
    };
  }

  const lines: ScriptLine[] = [];
  let inDialogue = false;
  let actionBuf: string[] = [];
  const flushAction = () => {
    if (actionBuf.length) {
      // Trim leading/trailing empty lines kept from "  " spacing.
      lines.push({ type: 'action', text: actionBuf.join('\n') });
      actionBuf = [];
    }
  };
  const prevBlank = (k: number) => k === 0 || raw[k - 1].trim() === '';
  const nextBlank = (k: number) => k + 1 >= raw.length || raw[k + 1].trim() === '';

  for (; i < raw.length; i++) {
    const line = raw[i];
    const t = line.trim();

    if (t === '') {
      inDialogue = false;
      flushAction();
      continue;
    }

    if (inDialogue) {
      if (/^\(.*\)$/.test(t)) lines.push({ type: 'parenthetical', text: t });
      else if (t.startsWith('~')) lines.push({ type: 'lyric', text: stripEmphasis(t.slice(1).trim()) });
      else lines.push({ type: 'dialogue', text: stripEmphasis(t) });
      continue;
    }

    if (/^={3,}$/.test(t)) { flushAction(); lines.push({ type: 'pageBreak', text: '' }); continue; }
    if (t.startsWith('#') || (t.startsWith('=') && !t.startsWith('==='))) continue; // sections, synopses

    // Scene heading (forced "." or standard prefix after a blank line)
    if ((t.startsWith('.') && !t.startsWith('..')) || (HEADING.test(t) && prevBlank(i))) {
      flushAction();
      let h = t.startsWith('.') && !HEADING.test(t) ? t.slice(1) : t.replace(/^\./, '');
      let num: string | undefined;
      const m = h.match(/\s*#([^#]+)#\s*$/);
      if (m) { num = m[1].trim(); h = h.slice(0, m.index); }
      lines.push({ type: 'sceneHeading', text: stripEmphasis(h.trim()), sceneNumber: num });
      continue;
    }

    if (t.startsWith('!')) { actionBuf.push(stripEmphasis(line.replace(/^\s*!/, ''))); continue; }

    if (t.startsWith('>') && t.endsWith('<')) {
      flushAction();
      lines.push({ type: 'centered', text: stripEmphasis(t.slice(1, -1).trim()) });
      continue;
    }
    if (t.startsWith('>')) { flushAction(); lines.push({ type: 'transition', text: stripEmphasis(t.slice(1).trim()) }); continue; }
    if (isAllCaps(t) && /TO:$/.test(t) && prevBlank(i) && nextBlank(i)) {
      flushAction();
      lines.push({ type: 'transition', text: t });
      continue;
    }
    if (t.startsWith('~')) { flushAction(); lines.push({ type: 'lyric', text: stripEmphasis(t.slice(1).trim()) }); continue; }

    // Character cue: forced @ or all caps, preceded by blank, followed by text.
    const forcedChar = t.startsWith('@');
    if ((forcedChar || (isAllCaps(t) && /[A-Z]/.test(t) && prevBlank(i))) && !nextBlank(i) && actionBuf.length === 0) {
      let name = forcedChar ? t.slice(1).trim() : t;
      const dual = name.endsWith('^');
      if (dual) name = name.slice(0, -1).trim();
      lines.push({ type: 'character', text: name, dual: dual || undefined });
      inDialogue = true;
      continue;
    }

    actionBuf.push(stripEmphasis(line.replace(/^ {0,3}/, '')));
  }
  flushAction();

  const headings = lines.filter((l) => l.type === 'sceneHeading').length;
  if (headings === 0) warnings.push('No scene headings found (lines starting with INT. or EXT.).');
  return { lines, titlePage, warnings };
}

export function toFountain(lines: ScriptLine[], titlePage?: Partial<TitlePage>, withNumbers?: string[]): string {
  const out: string[] = [];
  if (titlePage && (titlePage.title || titlePage.author)) {
    const tp: [string, string | undefined][] = [
      ['Title', titlePage.title], ['Credit', titlePage.credit], ['Author', titlePage.author],
      ['Source', titlePage.source], ['Draft date', titlePage.draftDate], ['Contact', titlePage.contact],
    ];
    for (const [k, v] of tp) {
      if (!v) continue;
      const parts = v.split('\n');
      if (parts.length === 1) out.push(`${k}: ${v}`);
      else { out.push(`${k}:`); parts.forEach((p) => out.push(`    ${p}`)); }
    }
    out.push('');
  }
  let sceneIdx = 0;
  const blank = () => { if (out.length && out[out.length - 1] !== '') out.push(''); };
  for (let k = 0; k < lines.length; k++) {
    const l = lines[k];
    switch (l.type) {
      case 'sceneHeading': {
        blank();
        const h = l.text.toUpperCase();
        const num = withNumbers?.[sceneIdx++];
        out.push((HEADING.test(h) ? h : '.' + h) + (num ? ` #${num}#` : ''));
        out.push('');
        break;
      }
      case 'action':
      case 'shot': {
        blank();
        const t = l.type === 'shot' ? l.text.toUpperCase() : l.text;
        const risky = isAllCaps(t) || HEADING.test(t) || /^[>~=#@.!]/.test(t);
        out.push(...t.split('\n').map((s, j) => (j === 0 && risky ? '!' + s : s)));
        out.push('');
        break;
      }
      case 'character': {
        blank();
        const n = l.text.toUpperCase();
        out.push((/[a-z]/.test(l.text) ? '@' + l.text : n) + (l.dual ? ' ^' : ''));
        break;
      }
      case 'parenthetical': {
        const p = l.text.trim();
        out.push(p.startsWith('(') ? p : `(${p})`);
        break;
      }
      case 'dialogue':
        out.push(l.text || '  ');
        if (lines[k + 1]?.type !== 'parenthetical' && lines[k + 1]?.type !== 'dialogue') out.push('');
        break;
      case 'lyric':
        out.push('~' + l.text);
        break;
      case 'transition': {
        blank();
        const t = l.text.toUpperCase();
        out.push(/TO:$/.test(t) ? t : '> ' + t);
        out.push('');
        break;
      }
      case 'centered':
        blank();
        out.push(`> ${l.text} <`);
        out.push('');
        break;
      case 'pageBreak':
        blank();
        out.push('===');
        out.push('');
        break;
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
