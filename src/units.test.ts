import { describe, expect, it } from 'vitest';
import { currencyParts, parseNumber, regionDefaults, showDistance, storeDistance, unitsOf } from './model/units';
import { newProject } from './model/defaults';

describe('typing numbers', () => {
  it('reads plain, grouped, pasted and locale-written numbers', () => {
    expect(parseNumber('1200', 'en-US')).toBe(1200);
    expect(parseNumber('1,200.50', 'en-US')).toBe(1200.5);
    expect(parseNumber('$1,200', 'en-US')).toBe(1200);
    expect(parseNumber('1.200,50', 'de-DE')).toBe(1200.5);
    expect(parseNumber('1.200', 'de-DE')).toBe(1200);
    expect(parseNumber('12,5', 'de-DE')).toBe(12.5);
    expect(parseNumber('1 234,5', 'fr-FR')).toBe(1234.5);
    expect(parseNumber('12.5', 'en-US')).toBe(12.5);
    expect(parseNumber('-40', 'en-US')).toBe(-40);
    expect(parseNumber('', 'en-US')).toBeUndefined();
    expect(parseNumber('abc', 'en-US')).toBeNaN();
  });
});

describe('currency symbols', () => {
  it('puts the symbol on the right side with the right decimals', () => {
    expect(currencyParts('USD', 'en-US')).toMatchObject({ symbol: '$', side: 'prefix', decimals: 2 });
    expect(currencyParts('EUR', 'fr-FR')).toMatchObject({ symbol: '€', side: 'suffix', decimals: 2 });
    expect(currencyParts('JPY', 'ja-JP').decimals).toBe(0);
    expect(currencyParts('CAD', 'en-US', 'narrow').symbol).toBe('$');
    expect(currencyParts('CAD', 'en-US', 'clear').symbol).toBe('CA$');
  });
});

describe('project units', () => {
  it('defaults from the region, and falls back to the old budget currency', () => {
    expect(regionDefaults('en-CA')).toMatchObject({ currency: 'CAD', distance: 'm' });
    expect(regionDefaults('en-US')).toMatchObject({ currency: 'USD', distance: 'ft' });
    expect(regionDefaults('de-AT').currency).toBe('EUR');
    const p = newProject('U');
    expect(unitsOf({ budget: { ...p.budget, currency: 'GBP' } }).currency).toBe('GBP');
  });
  it('stores feet and shows metres', () => {
    expect(showDistance(10, 'm')).toBe(3.05);
    expect(Math.round(storeDistance(3.05, 'm'))).toBe(10);
    expect(showDistance(10, 'ft')).toBe(10);
  });
});

import { parseDuration, formatDuration, parseFeeText } from './model/units';
import { migrate } from './store/migrate';
import { money, setMoneyFormat } from './budget/calc';
import { breakdownCandidates, breakdownFacts } from './budget/fromBreakdown';
import { derive } from './script/derive';
import { buildSampleProduction } from './model/sampleProduction';

describe('location fees become amounts', () => {
  it('parses the old text, keeping extra words as a note', () => {
    expect(parseFeeText('$200/day')).toEqual({ amount: 200, per: 'day', note: undefined });
    expect(parseFeeText('$150 flat')).toEqual({ amount: 150, per: 'flat', note: undefined });
    expect(parseFeeText('Free (a thank-you credit)')).toEqual({ amount: 0, per: 'flat', note: 'Free (a thank-you credit)' });
    expect(parseFeeText('$300/day incl. power')).toMatchObject({ amount: 300, per: 'day', note: '$300/day incl. power' });
  });
  it('moves them on load, and the budget reads the amount', () => {
    const p = newProject('L');
    p.locations = [{ id: 'l1', setName: 'DINER', realName: 'Diner', address: '', fee: '$250/day', photoIds: [] } as never, { id: 'l2', setName: 'ROAD', realName: 'Road', address: '', fee: '$150 flat', photoIds: [] } as never];
    const m = migrate(JSON.parse(JSON.stringify(p)));
    expect(m.locations.map((l) => [l.feeAmount, l.feePer, l.fee])).toEqual([[250, 'day', undefined], [150, 'flat', undefined]]);
    const lines = breakdownCandidates(m, breakdownFacts(m, derive(m.scriptDoc)));
    const fee = (name: string) => lines.find((l) => l.description.includes(name))!;
    expect([fee('Diner').rate, fee('Diner').units]).toEqual([250, 'days']);
    expect([fee('Road').rate, fee('Road').units]).toEqual([150, 'flat']);
  });
  it('the sample production uses amounts', () => {
    const s = buildSampleProduction();
    expect(s.locations.every((l) => l.feeAmount != null)).toBe(true);
    expect(s.units?.currency).toBe('USD');
  });
});

describe('durations', () => {
  it('reads 0:12, 12, 1m 5s', () => {
    expect(parseDuration('0:12')).toBe(12);
    expect(parseDuration('12')).toBe(12);
    expect(parseDuration('1m 5s')).toBe(65);
    expect(formatDuration(65)).toBe('1:05');
    expect(parseDuration('soon')).toBeUndefined();
  });
});

describe('money follows the project', () => {
  it('uses the project currency and number format', () => {
    setMoneyFormat({ currency: 'EUR', locale: 'fr-FR', display: 'narrowSymbol' });
    expect(money(1234, 'USD').replace(/\s/g, ' ')).toBe('1 234 €');
    setMoneyFormat(null);
    expect(money(1234, 'USD')).toBe('$1,234');
  });
});
