import type { BudgetAccount, BudgetGroup, BudgetLine, BudgetLinkKind, BudgetUnits } from '../model/types';
import { newId } from '../model/ids';

// Starting budgets by production type: the usual lines with units and links, rates left for you
// to fill in (real rates vary too much by place, union status and year to guess them).

interface TLine { acc: string; d: string; u: BudgetUnits; link?: BudgetLinkKind; qty?: number; x?: number; qtyExpr?: string; items?: string[] }
export interface BudgetTemplate {
  id: string;
  name: string;
  description: string;
  /** A different chart of accounts (commercials); otherwise the standard film one. */
  accounts?: BudgetAccount[];
  lines: TLine[];
}

const A = (code: string, name: string, group: BudgetGroup): BudgetAccount => ({ id: `acc-${code}`, code, name, group });

/** An AICP-style bid form layout for commercials (sections A–P), described in our own words. */
const COMMERCIAL_ACCOUNTS: BudgetAccount[] = [
  A('A', 'Prep & wrap crew', 'btl'), A('B', 'Shoot crew', 'btl'), A('C', 'Prep & wrap expenses', 'btl'),
  A('D', 'Locations & travel', 'btl'), A('E', 'Props, wardrobe & animals', 'btl'), A('F', 'Studio & stage', 'btl'),
  A('G', 'Set construction labor', 'btl'), A('H', 'Set construction materials', 'btl'), A('I', 'Equipment rental', 'btl'),
  A('J', 'Media & storage', 'btl'), A('K', 'Miscellaneous', 'other'), A('L', 'Director & creative fees', 'atl'),
  A('M', 'Talent', 'atl'), A('N', 'Talent expenses', 'atl'), A('O', 'Editorial & finishing', 'post'), A('P', 'Agency / other', 'other'),
];

export const BUDGET_TEMPLATES: BudgetTemplate[] = [
  {
    id: 'short', name: 'Short film', description: 'A few shoot days, a small crew, festival run.',
    lines: [
      { acc: '1100', d: 'Story rights / option', u: 'flat' },
      { acc: '1200', d: 'Producer', u: 'flat' },
      { acc: '1300', d: 'Director', u: 'flat' },
      { acc: '2000', d: 'Production assistants', u: 'days', link: 'shootDays', x: 2 },
      { acc: '2200', d: 'Camera package', u: 'rentdays', link: 'shootDays', items: ['Camera body', 'Lenses', 'Monitor', 'Media & batteries'] },
      { acc: '2300', d: 'Grip & lighting package', u: 'rentdays', link: 'shootDays' },
      { acc: '2400', d: 'Art department & set dressing', u: 'allow' },
      { acc: '2600', d: 'Wardrobe', u: 'allow' },
      { acc: '2700', d: 'Hair & makeup supplies', u: 'allow' },
      { acc: '2800', d: 'Sound package', u: 'rentdays', link: 'shootDays' },
      { acc: '3400', d: 'Vehicles & fuel', u: 'days', link: 'shootDays' },
      { acc: '3500', d: 'Meals & craft services', u: 'each', link: 'headcount' },
      { acc: '3600', d: 'Production insurance', u: 'flat' },
      { acc: '4100', d: 'Editor', u: 'weeks', qty: 2 },
      { acc: '4200', d: 'Music license / composer', u: 'flat' },
      { acc: '4400', d: 'Sound mix', u: 'flat' },
      { acc: '4500', d: 'Color grade & deliverables', u: 'flat' },
      { acc: '5100', d: 'Festival submissions', u: 'each', qty: 15 },
    ],
  },
  {
    id: 'micro', name: 'Micro-budget feature', description: 'Three to four weeks of shooting, a lean crew, full post.',
    lines: [
      { acc: '1100', d: 'Screenplay / rights', u: 'flat' },
      { acc: '1200', d: 'Producers', u: 'flat', x: 2 },
      { acc: '1300', d: 'Director', u: 'flat' },
      { acc: '2000', d: 'Line producer / UPM', u: 'weeks', qtyExpr: 'SHOOT_WEEKS + 4' },
      { acc: '2000', d: '1st AD', u: 'days', link: 'shootDays' },
      { acc: '2000', d: 'Production assistants', u: 'days', link: 'shootDays', x: 3 },
      { acc: '2100', d: 'Background / extras', u: 'days', link: 'shootDays' },
      { acc: '2200', d: 'Director of photography', u: 'days', link: 'shootDays' },
      { acc: '2200', d: 'Camera assistants', u: 'days', link: 'shootDays', x: 2 },
      { acc: '2200', d: 'Camera package', u: 'rentdays', link: 'shootDays', items: ['Camera body', 'Lens set', 'Follow focus & matte box', 'Monitors', 'Media & batteries'] },
      { acc: '2300', d: 'Gaffer & key grip', u: 'days', link: 'shootDays', x: 2 },
      { acc: '2300', d: 'Grip & electric package', u: 'rentdays', link: 'shootDays' },
      { acc: '2400', d: 'Production designer', u: 'weeks', qtyExpr: 'SHOOT_WEEKS + 2' },
      { acc: '2400', d: 'Set dressing & construction', u: 'allow' },
      { acc: '2500', d: 'Props', u: 'allow' },
      { acc: '2600', d: 'Costume designer', u: 'weeks', qtyExpr: 'SHOOT_WEEKS + 1' },
      { acc: '2600', d: 'Wardrobe purchases & rentals', u: 'allow' },
      { acc: '2700', d: 'Hair & makeup', u: 'days', link: 'shootDays' },
      { acc: '2800', d: 'Sound mixer & boom', u: 'days', link: 'shootDays', x: 2 },
      { acc: '2900', d: 'Location fees', u: 'days', link: 'shootDays' },
      { acc: '2900', d: 'Permits', u: 'allow' },
      { acc: '3400', d: 'Production vehicles', u: 'days', link: 'shootDays', x: 2 },
      { acc: '3500', d: 'Meals & craft services', u: 'each', link: 'headcount' },
      { acc: '3600', d: 'Production insurance', u: 'flat' },
      { acc: '4100', d: 'Editor', u: 'weeks', qty: 12 },
      { acc: '4200', d: 'Composer / music licensing', u: 'flat' },
      { acc: '4300', d: 'Visual effects', u: 'allow' },
      { acc: '4400', d: 'Sound design & mix', u: 'flat' },
      { acc: '4500', d: 'Color grade', u: 'flat' },
      { acc: '4500', d: 'Deliverables (DCP, captions, masters)', u: 'flat' },
      { acc: '5100', d: 'Festivals & marketing', u: 'allow' },
      { acc: '5200', d: 'Legal & accounting', u: 'allow' },
    ],
  },
  {
    id: 'musicvideo', name: 'Music video', description: 'One or two shoot days, lots of look, quick post.',
    lines: [
      { acc: '1300', d: 'Director', u: 'flat' },
      { acc: '1200', d: 'Producer', u: 'flat' },
      { acc: '1400', d: 'Dancers / featured talent', u: 'days', link: 'shootDays', x: 4 },
      { acc: '2200', d: 'DP', u: 'days', link: 'shootDays' },
      { acc: '2200', d: 'Camera package', u: 'rentdays', link: 'shootDays' },
      { acc: '2300', d: 'Lighting & grip package', u: 'rentdays', link: 'shootDays' },
      { acc: '2400', d: 'Art & set build', u: 'allow' },
      { acc: '2600', d: 'Styling & wardrobe', u: 'allow' },
      { acc: '2700', d: 'Hair & makeup', u: 'days', link: 'shootDays', x: 2 },
      { acc: '2900', d: 'Studio / location', u: 'days', link: 'shootDays' },
      { acc: '3500', d: 'Catering', u: 'each', link: 'headcount' },
      { acc: '4100', d: 'Editor', u: 'days', qty: 5 },
      { acc: '4300', d: 'VFX / graphics', u: 'allow' },
      { acc: '4500', d: 'Color grade', u: 'flat' },
    ],
  },
  {
    id: 'commercial', name: 'Commercial (AICP-style sections)', description: 'Bid-form sections A–P, as agencies expect.',
    accounts: COMMERCIAL_ACCOUNTS,
    lines: [
      { acc: 'A', d: 'Producer — prep & wrap', u: 'days', qty: 5 },
      { acc: 'A', d: 'Production designer — prep', u: 'days', qty: 3 },
      { acc: 'B', d: 'Director of photography', u: 'days', link: 'shootDays' },
      { acc: 'B', d: '1st AD', u: 'days', link: 'shootDays' },
      { acc: 'B', d: 'Gaffer, key grip & crew', u: 'days', link: 'shootDays', x: 4 },
      { acc: 'C', d: 'Casting', u: 'allow' },
      { acc: 'C', d: 'Scouting & office', u: 'allow' },
      { acc: 'D', d: 'Location fees & permits', u: 'days', link: 'shootDays' },
      { acc: 'D', d: 'Catering', u: 'each', link: 'headcount' },
      { acc: 'E', d: 'Props & wardrobe', u: 'allow' },
      { acc: 'F', d: 'Stage rental', u: 'days', link: 'shootDays' },
      { acc: 'G', d: 'Set construction crew', u: 'days', qty: 3, x: 3 },
      { acc: 'H', d: 'Set materials', u: 'allow' },
      { acc: 'I', d: 'Camera, grip & lighting rental', u: 'rentdays', link: 'shootDays' },
      { acc: 'J', d: 'Media, drives & backup', u: 'allow' },
      { acc: 'K', d: 'Insurance & miscellaneous', u: 'allow' },
      { acc: 'L', d: 'Director fee', u: 'days', link: 'shootDays' },
      { acc: 'M', d: 'Principal talent', u: 'days', link: 'shootDays', x: 2 },
      { acc: 'N', d: 'Talent travel & fittings', u: 'allow' },
      { acc: 'O', d: 'Editorial, color & mix', u: 'allow' },
    ],
  },
];

/** The template's lines as budget lines (rates 0), filed in `accounts` by code. */
export function templateLines(t: BudgetTemplate, accounts: BudgetAccount[]): BudgetLine[] {
  const byCode = new Map(accounts.map((a) => [a.code, a.id]));
  return t.lines.map((l) => ({
    id: newId(),
    accountId: byCode.get(l.acc) ?? accounts.find((a) => a.group === 'btl')?.id ?? accounts[0].id,
    description: l.d,
    qty: l.qty ?? 1,
    units: l.u,
    x: l.x ?? 1,
    rate: 0,
    fringeIds: [],
    ...(l.qtyExpr ? { qtyExpr: l.qtyExpr } : {}),
    ...(l.items ? { items: l.items.map((d) => ({ id: newId(), description: d, qty: 1, rate: 0 })) } : {}),
    ...(l.link ? { link: { kind: l.link, auto: true } } : {}),
  }));
}
