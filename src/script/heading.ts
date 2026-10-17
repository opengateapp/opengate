import type { IntExt, TimeOfDay } from '../model/types';

// Scene-heading parsing: union of CineSched's parseSceneHeading (numbers, full
// time-of-day vocabulary) and the shot-list reference's parseSlugLine.

export interface ParsedHeading {
  number?: string;
  intExt: IntExt;
  set: string;
  time: TimeOfDay;
  timeLabel: string;
}

export const HEADING_PREFIX = /^(?:\d+[A-Z]?\.?\s+)?(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\s*\/\s*E\.?|INT\.?|EXT\.?|EST\.?)(?=[\s.])/i;

const TIME_WORDS: [RegExp, TimeOfDay][] = [
  [/\b(DAWN|SUNRISE|FIRST LIGHT|AMANECER)\b/, 'DAWN'],
  [/\b(DUSK|SUNSET|TWILIGHT|MAGIC HOUR|GOLDEN HOUR|ATARDECER|OCASO)\b/, 'DUSK'],
  [/\b(AFTERNOON|TARDE)\b/, 'AFTERNOON'],
  [/\b(NIGHT|EVENING|MIDNIGHT|NOCHE)\b/, 'NIGHT'],
  [/\b(DAY|MORNING|NOON|MIDDAY|D[IÍ]A|MA[NÑ]ANA)\b/, 'DAY'],
];

export function isHeadingText(text: string): boolean {
  return HEADING_PREFIX.test(text.trim());
}

export function classifyTime(label: string): TimeOfDay {
  const u = label.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const [re, t] of TIME_WORDS) if (re.test(u)) return t;
  return 'CUSTOM';
}

export function parseHeading(raw: string): ParsedHeading {
  let text = raw.trim().replace(/^\./, '');
  let number: string | undefined;
  const fnum = text.match(/\s*#([^#]+)#\s*$/);
  if (fnum) {
    number = fnum[1].trim();
    text = text.slice(0, fnum.index).trim();
  }
  const lead = text.match(/^(\d+[A-Z]{0,2})\.?\s+(?=(INT|EXT|I\/E|EST))/i);
  if (lead) {
    number = number ?? lead[1];
    text = text.slice(lead[0].length);
  }
  // Trailing number as printed in shooting scripts: "INT. HOUSE - DAY 12"
  const trail = text.match(/\s+(\d+[A-Z]{0,2})$/);
  if (trail && lead) text = text.slice(0, trail.index);

  let intExt: IntExt = 'INT';
  const pre = text.match(HEADING_PREFIX);
  if (pre) {
    const p = pre[1].toUpperCase().replace(/\s/g, '');
    if (p.includes('/') ) intExt = 'INT/EXT';
    else if (p.startsWith('EXT')) intExt = 'EXT';
    text = text.slice(pre[0].length).replace(/^[\s.]+/, '');
  }

  let set = text;
  let timeLabel = '';
  const dash = text.match(/^(.*?)\s+[-–—]+\s+([^-–—]+)$/);
  if (dash) {
    set = dash[1];
    timeLabel = dash[2].trim();
  }
  let time = timeLabel ? classifyTime(timeLabel) : 'CUSTOM';
  if (time === 'CUSTOM' && !timeLabel) time = 'DAY';
  return { number, intExt, set: set.trim().toUpperCase(), time, timeLabel: timeLabel.toUpperCase() };
}
