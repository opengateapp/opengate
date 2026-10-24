import type { Project, ProjectUnits } from './types';

// The project's currency and measurements (Settings → Project → Units & currency), shared with
// everyone on the project. Money is shown in the project currency and never converted; distances
// are stored in feet and shown in feet or metres.

/** Region → currency, for "Use my region's defaults" (Intl has no lookup for this). */
const REGION_CURRENCY: Record<string, string> = {
  US: 'USD', CA: 'CAD', GB: 'GBP', AU: 'AUD', NZ: 'NZD', IE: 'EUR', JP: 'JPY', IN: 'INR', MX: 'MXN', BR: 'BRL', ZA: 'ZAR',
  SE: 'SEK', NO: 'NOK', DK: 'DKK', CH: 'CHF', LI: 'CHF', IS: 'ISK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', RS: 'RSD', UA: 'UAH', TR: 'TRY',
  KR: 'KRW', CN: 'CNY', HK: 'HKD', TW: 'TWD', SG: 'SGD', TH: 'THB', PH: 'PHP', ID: 'IDR', MY: 'MYR', VN: 'VND', PK: 'PKR', BD: 'BDT', LK: 'LKR',
  AE: 'AED', SA: 'SAR', QA: 'QAR', IL: 'ILS', EG: 'EGP', MA: 'MAD', NG: 'NGN', KE: 'KES', GH: 'GHS', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN', UY: 'UYU',
  ...Object.fromEntries(['AT', 'BE', 'BG', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES'].map((r) => [r, 'EUR'])),
};
/** Where people mostly measure in feet. (Film crews elsewhere often do too: the setting is per project.) */
const FEET_REGIONS = new Set(['US', 'LR', 'MM']);

const deviceLocale = () => (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
const regionOf = (locale: string) => { try { return new Intl.Locale(locale).maximize().region ?? 'US'; } catch { return 'US'; } };

/** Defaults from a device's region: en-CA → CAD, metres, 1,234.50. */
export function regionDefaults(locale = deviceLocale()): ProjectUnits {
  const region = regionOf(locale);
  return { currency: REGION_CURRENCY[region] ?? 'USD', symbolStyle: 'narrow', distance: FEET_REGIONS.has(region) ? 'ft' : 'm', locale };
}

/** The project's units: what's set, else the old budget currency, else US defaults. */
export function unitsOf(p?: Pick<Project, 'units' | 'budget'> | null): ProjectUnits {
  if (!p) return regionDefaults();
  const u = p.units;
  return {
    currency: u?.currency || p?.budget?.currency || 'USD',
    symbolStyle: u?.symbolStyle ?? 'narrow',
    distance: u?.distance ?? 'ft',
    locale: u?.locale || deviceLocale(),
  };
}

/** Every currency the browser knows, with names: "CAD — Canadian dollar". */
export function allCurrencies(locale = deviceLocale()): { code: string; name: string }[] {
  let codes: string[] = [];
  try { codes = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('currency') ?? []; } catch { /* old browser */ }
  if (!codes.length) codes = [...new Set(Object.values(REGION_CURRENCY))].sort();
  let names: Intl.DisplayNames | null = null;
  try { names = new Intl.DisplayNames([locale], { type: 'currency' }); } catch { /* no names */ }
  return codes.map((code) => ({ code, name: names?.of(code) ?? code }));
}

// ---------------------------------------------------------------- money and numbers

export interface CurrencyParts { symbol: string; side: 'prefix' | 'suffix'; space: boolean; decimals: number }

/** The symbol, which side it goes on and the usual decimals: "$" before for USD, "€" after for EUR in fr-FR, no decimals for JPY. */
export function currencyParts(currency: string, locale = deviceLocale(), style: ProjectUnits['symbolStyle'] = 'narrow'): CurrencyParts {
  try {
    const f = new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: style === 'clear' ? 'symbol' : 'narrowSymbol' });
    const parts = f.formatToParts(1234.5);
    const ci = parts.findIndex((x) => x.type === 'currency');
    const ii = parts.findIndex((x) => x.type === 'integer');
    const side = ci < ii ? 'prefix' : 'suffix';
    const between = side === 'prefix' ? parts[ci + 1] : parts[ci - 1];
    return { symbol: parts[ci]?.value ?? currency, side, space: between?.type === 'literal', decimals: f.resolvedOptions().maximumFractionDigits ?? 2 };
  } catch {
    return { symbol: currency, side: 'prefix', space: true, decimals: 2 };
  }
}

/** The locale's grouping and decimal marks: "," and "." in en-US; "." and "," in de-DE; " " and "," in fr-FR. */
export function separators(locale = deviceLocale()): { group: string; decimal: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  return { group: parts.find((x) => x.type === 'group')?.value ?? ',', decimal: parts.find((x) => x.type === 'decimal')?.value ?? '.' };
}

/**
 * A typed number: "1200", "1,200.50", pasted "$1,200", or "1.200,50" in a locale that writes it so.
 * Returns undefined for an empty box and NaN for something that isn't a number.
 */
export function parseNumber(text: string, locale = deviceLocale()): number | undefined {
  const raw = text.trim();
  if (!raw) return undefined;
  const neg = /^\(.*\)$/.test(raw) || /^[^\d]*-/.test(raw);
  // Keep digits and marks; spaces and apostrophes only ever group ("1 234", "1'234").
  const s = raw.replace(/[^\d.,]/g, '');
  if (!/\d/.test(s)) return NaN;
  const { group } = separators(locale);
  const dots = (s.match(/\./g) ?? []).length, commas = (s.match(/,/g) ?? []).length;
  let dec: '.' | ',' | null;
  if (dots && commas) dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ','; // the later mark is the decimal one
  else if (dots + commas === 0) dec = null;
  else {
    const mark = dots ? '.' : ',';
    const many = (dots || commas) > 1;
    // "1,200" in en-US or "1.200" in de-DE: a single grouping mark before three digits.
    const groupsThree = mark === group && new RegExp(`\\${mark}\\d{3}$`).test(s);
    dec = many || groupsThree ? null : mark;
  }
  const [int, frac] = dec ? [s.slice(0, s.lastIndexOf(dec)), s.slice(s.lastIndexOf(dec) + 1)] : [s, ''];
  const n = Number(`${int.replace(/[.,]/g, '') || '0'}.${frac.replace(/[.,]/g, '') || '0'}`);
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
}

/** A number with the locale's separators, at most `decimals` places. */
export function formatNumber(n: number, locale = deviceLocale(), decimals = 2): string {
  try { return new Intl.NumberFormat(locale, { maximumFractionDigits: decimals }).format(n); } catch { return String(n); }
}

// ---------------------------------------------------------------- distance

const FT_PER_M = 3.28084;
/** Feet (as stored) → the project's unit. */
export const showDistance = (ft: number, unit: ProjectUnits['distance']) => (unit === 'm' ? Math.round((ft / FT_PER_M) * 100) / 100 : ft);
/** The project's unit → feet (as stored). */
export const storeDistance = (v: number, unit: ProjectUnits['distance']) => (unit === 'm' ? v * FT_PER_M : v);

// ---------------------------------------------------------------- location fees typed as text

/** "$200/day" → 200 per day; "$150 flat" → 150 flat; "Free (a thank-you credit)" → 0 flat, keeping the words as a note. */
export function parseFeeText(text: string | undefined): { amount: number; per: 'day' | 'flat'; note?: string } | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  const m = t.replace(/,/g, '').match(/\d+(\.\d+)?/);
  const amount = m ? Number(m[0]) : 0;
  const per: 'day' | 'flat' = /\b(flat|total|once|one[- ]off|for the shoot|whole)\b/i.test(t) || /^\s*free\b/i.test(t) || !m ? 'flat' : 'day';
  // Nothing more than the amount and how it's charged: no note needed.
  const plain = /^\s*[^\d\s]{0,3}\s*[\d.,]+\s*(\/\s*day|per day|a day|daily|\/d|flat|total)?\s*$/i.test(t);
  return { amount, per, note: plain ? undefined : t };
}

// ---------------------------------------------------------------- durations (m:ss)

/** "0:12", "12", "12s", "1m 5s", "1:05" → seconds; undefined when it can't tell. */
export function parseDuration(text: string): number | undefined {
  const t = text.trim().toLowerCase();
  if (!t) return undefined;
  let m = t.match(/^(\d+):([0-5]?\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/^(?:(\d+)\s*m(?:in)?)?\s*(?:(\d+)\s*s(?:ec)?)?$/);
  if (m && (m[1] || m[2])) return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  m = t.match(/^\d+$/);
  return m ? Number(t) : undefined;
}
export const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
