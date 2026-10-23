import { describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { parseFountain } from './io/fountain';
import { applyImportedScript } from './io/applyImport';
import { newProject } from './model/defaults';
import { SAMPLE_FOUNTAIN } from './model/sample';
import { derive } from './script/derive';
import { budgetView } from './budget/pipeline';
import { totals } from './budget/calc';
import { estimatedFacts, usesEstimate } from './budget/fromBreakdown';
import { STARTER_NOTE, crowdfundingGoal, defaultCrowd, forgottenItems, quickEstimate, raiseSummary } from './budget/funding';
import { BUDGET_TEMPLATES, MARKETING_LINES, missingMarketingLines, templateLines } from './budget/templates';
import { MARKETING_TASKS, addMarketingTasks, marketingAnchors } from './plan/marketingTasks';
import { buildSampleProduction } from './model/sampleProduction';
import { CATEGORIES, PAGES, pageById } from './reference/topics';
import { learnMore } from './reference/library';

const scriptOnly = () => {
  const p = produce(newProject('Reel'), (d) => { applyImportedScript(d, parseFountain(SAMPLE_FOUNTAIN)); });
  return { p, d: derive(p.scriptDoc) };
};

describe('how much to raise: from an unscheduled script', () => {
  it('estimates shoot days from page count, grouped by location', () => {
    const { p, d } = scriptOnly();
    const slow = estimatedFacts(p, d, 0.5);
    const fast = estimatedFacts(p, d, 8);
    expect(fast.shootDays).toBeLessThan(slow.shootDays);
    expect(fast.shootDays).toBeGreaterThanOrEqual(new Set(d.scenes.map((s) => s.set)).size);
    expect(fast.cast.map((c) => c.label)).toEqual(expect.arrayContaining(['MAYA', 'THEO']));
    expect(fast.estimated).toBe(true);
  });

  it('quick estimate gives a real total with no schedule, and never overwrites a typed rate', () => {
    let { p } = scriptOnly();
    const { d } = scriptOnly();
    p = produce(p, (dr) => {
      dr.budget.lines.push({ id: 'mine', accountId: 'acc-1400', description: 'Mine', qty: 1, units: 'flat', x: 1, rate: 999, fringeIds: [] });
      dr.budget.lines.push({ id: 'free', accountId: 'acc-2100', description: 'Volunteers', qty: 1, units: 'days', x: 1, rate: 0, fringeIds: [], notes: 'Volunteers, fed and credited.', link: { kind: 'headcount', auto: true } });
    });
    expect(totals(p.budget, budgetView(p, d).lines).total).toBeCloseTo(999 * 1.1);
    // The sample production's deliberate $0 lines survive a quick estimate.
    const sp = buildSampleProduction();
    const sd = derive(sp.scriptDoc, sp.sceneNumbersLocked);
    const before = totals(sp.budget, budgetView(sp, sd).lines).total;
    const sp2 = produce(sp, (dr) => { quickEstimate(dr, sd, 'indie', 3); });
    expect(totals(sp2.budget, budgetView(sp2, sd).lines).total).toBeLessThan(before * 1.1);
    p = produce(p, (dr) => { quickEstimate(dr, d, 'micro', 3); });
    expect(usesEstimate(p)).toBe(true);
    const t = totals(p.budget, budgetView(p, d).lines).total;
    expect(t).toBeGreaterThan(1000);
    expect(p.budget.lines.find((l) => l.id === 'mine')!.rate).toBe(999);
    expect(p.budget.lines.find((l) => l.id === 'free')!.rate).toBe(0);
    expect(p.budget.lines.filter((l) => l.notes?.includes(STARTER_NOTE)).length).toBeGreaterThan(0);
    // Running it again adds nothing new.
    let again = { added: -1, filled: -1 };
    p = produce(p, (dr) => { again = quickEstimate(dr, d, 'micro', 3); });
    expect(again).toEqual({ added: 0, filled: 0 });
  });

  it('flags what beginners forget, and fixes it', () => {
    const { p: p0, d } = scriptOnly();
    let p = produce(p0, (dr) => { quickEstimate(dr, d, 'micro', 3); dr.budget.contingencyPct = 0; });
    const before = forgottenItems(p, d);
    for (const id of ['contingency', 'insurance', 'legal', 'post', 'marketing']) expect(before.find((c) => c.id === id)!.ok, id).toBe(false);
    p = produce(p, (dr) => { for (const c of before) if (!c.ok && c.fix) c.fix(dr); });
    const after = forgottenItems(p, d);
    expect(after.find((c) => c.id === 'contingency')!.ok).toBe(true);
    expect(after.find((c) => c.id === 'insurance')!.ok).toBe(true);
    expect(after.find((c) => c.id === 'legal')!.ok).toBe(true);
  });
});

describe('crowdfunding goal with perks and fulfilment', () => {
  it('grosses up for fees and rewards', () => {
    const plain = crowdfundingGoal(10000, { ...defaultCrowd(), feePct: 5, processingPct: 3, perPledge: 0, pledgeMgrPct: 0, taxReservePct: 0, noRewardPct: 0, tiers: [] });
    expect(plain.goal).toBeGreaterThanOrEqual(Math.ceil(10000 / 0.92));
    expect(plain.goal).toBeLessThan(10000 / 0.92 + 50);
    // A $50 poster tier costing $15 + $10 postage eats half of every pledge.
    const poster = crowdfundingGoal(10000, { ...defaultCrowd(), feePct: 5, processingPct: 3, perPledge: 0.3, pledgeMgrPct: 0, taxReservePct: 0, noRewardPct: 0, tiers: [{ id: 't', name: 'Poster', price: 50, backers: 10, costEach: 15, shipEach: 10 }] });
    expect(poster.rewardPct).toBeCloseTo(0.5);
    expect(poster.goal).toBeGreaterThan(plain.goal * 2);
    expect(poster.goal - poster.fees - poster.rewards).toBeGreaterThanOrEqual(10000 - 50);
    expect(poster.tierCosts[0].margin).toBeLessThan(0.5);
    // Rewards that cost more than the pledge can't work.
    expect(crowdfundingGoal(5000, { ...defaultCrowd(), tiers: [{ id: 'x', name: 'Mug', price: 20, backers: 10, costEach: 15, shipEach: 10 }], noRewardPct: 0 }).impossible).toBe(true);
  });
});

describe('marketing in budgets and tasks', () => {
  it('templates carry the marketing block, and "add missing" never duplicates', () => {
    const short = BUDGET_TEMPLATES.find((t) => t.id === 'short')!;
    const accounts = newProject('x').budget.accounts;
    const lines = templateLines(short, accounts);
    const m = lines.filter((l) => l.accountId === 'acc-5100');
    expect(m.length).toBe(MARKETING_LINES.length);
    expect(missingMarketingLines(accounts, lines)).toHaveLength(0);
    expect(missingMarketingLines(accounts, lines.filter((l) => l.description !== 'Trailer edit')).map((l) => l.description)).toEqual(['Trailer edit']);
  });

  it('times the checklist from the shoot and picture lock, without duplicates', () => {
    const p = buildSampleProduction();
    const a = marketingAnchors(p);
    expect(a.fromSchedule).toBe(true);
    const stills = p.tasks.find((t) => /unit stills/i.test(t.title))!;
    expect(stills.due! < a.shoot).toBe(true);
    expect(stills.done).toBe(true);
    let n = -1;
    produce(p, (dr) => { n = addMarketingTasks(dr); });
    expect(n).toBe(0);
    expect(p.tasks.filter((t) => t.department === 'Marketing')).toHaveLength(MARKETING_TASKS.length);
  });
});

describe('the sample production’s funding', () => {
  it('shows a real gap and a crowdfunding goal', () => {
    const p = buildSampleProduction();
    const d = derive(p.scriptDoc, p.sceneNumbersLocked);
    const s = raiseSummary(p, d);
    expect(s.estimated).toBe(false); // it's scheduled
    expect(s.secured).toBe(3000 + 300 + 4000);
    expect(s.hoped).toBe(2500);
    expect(s.toRaise).toBeGreaterThan(5000);
    expect(s.toRaiseIfAll).toBe(s.toRaise - 2500);
    expect(s.before + s.after).toBeCloseTo(s.total, -1);
    expect(p.budget.lines.some((l) => l.accountId === 'acc-5100' && l.rate > 0)).toBe(true);
    const r = crowdfundingGoal(s.toRaise, p.budget.funding!.crowd!);
    expect(r.goal).toBeGreaterThan(s.toRaise);
    expect(r.impossible).toBe(false);
  });
});

describe('Budget & Funding and Legal & Insurance reference', () => {
  it('has the new categories, sources where it quotes figures, and the old page id', () => {
    for (const id of ['money', 'legal']) expect(CATEGORIES.some((c) => c.id === id)).toBe(true);
    expect(pageById('budget-terms')?.category).toBe('money');
    const money = PAGES.filter((p) => p.category === 'money' || p.category === 'legal');
    expect(money.length).toBeGreaterThanOrEqual(20);
    for (const id of ['crowdfunding', 'crowdfunding-rewards', 'incentives-us', 'incentives-uk', 'incentives-ca', 'incentives-au', 'incentives-eu', 'insurance', 'legal-drones']) {
      const pg = pageById(id)!;
      expect(pg.sources?.length, id).toBeGreaterThan(0);
      expect(pg.checked, id).toBeTruthy();
    }
    for (const p of money) expect(learnMore(p.topics).length, p.id).toBeGreaterThan(0);
    const glossary = pageById('money-words')!;
    for (const term of ['EFC', 'MG', 'Waterfall']) expect(glossary.keywords!.toLowerCase()).toContain(term.toLowerCase());
  });
});
