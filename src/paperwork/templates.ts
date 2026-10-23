import type { PaperKind, Project } from '../model/types';
import type { Person } from './paperwork';

// Plain-language starter text for releases and deal memos, written for Open Gate. They are a
// starting point only: laws differ by place, so every one carries a "have a lawyer review" note.

export const LAWYER_NOTE = 'Starting point only — not legal advice. Have a lawyer review this for your production and location.';

const T: Partial<Record<PaperKind, string>> = {
  deal: `DEAL MEMO

Production: {{production}} ("the Production"), produced by {{company}}.
Person: {{name}}
Position: {{role}}

Rate: {{rate}}
Kit / box rental: {{kit}}
Guaranteed: {{guarantee}}
Overtime: {{overtime}}

Dates: from __________ to __________ (prep, shoot and wrap as scheduled).
Credit: name and position in the end credits, if the person appears in the final cut and the Production gives credits.

The Production will pay by __________ after each pay period. The person is engaged as {{engagement}}.
Either side may end this engagement with __________ days' notice, with pay for work already done.

Signed: ______________________   Date: __________
For the Production: ______________________   Date: __________`,

  crew: `CREW AGREEMENT

I, {{name}}, will work on {{production}} as {{role}}.

1. Work product. Everything I create for the Production in this job belongs to the Production, to use in the film and its promotion in all media, worldwide, forever.
2. Confidentiality. I won't share the script, footage or private production information without permission.
3. Safety. I'll follow the safety instructions of the department heads and the 1st AD, and report hazards right away.
4. Credit. If I appear in the final cut's credits, it will be as {{role}}.

Signed: ______________________   Date: {{date}}`,

  talent: `TALENT RELEASE

I, {{name}}, appear in {{production}} as {{role}}.

I give {{company}} and anyone it authorises permission to record my performance, voice and likeness, and to use those recordings, my name and approved photographs in the film, its trailers and its promotion, in all media, worldwide, forever.

I understand I'm paid as agreed in my deal memo, and that the Production doesn't have to use my performance.

Signed: ______________________   Date: {{date}}
If under 18, parent or guardian: ______________________`,

  appearance: `APPEARANCE RELEASE

I agree that {{production}} may film me, and use my image and voice in the film and its promotion, in all media, worldwide, forever. I'm not owed payment unless agreed separately.

Name: {{name}}
Signed: ______________________   Date: {{date}}
If under 18, parent or guardian: ______________________`,

  location: `LOCATION RELEASE

Property: {{location}}
Owner / authorised person: {{name}}

The owner allows {{company}} to enter and film at the property for {{production}} on the agreed dates, including prep and wrap, and to use the footage (including the property's appearance and name, if shown) in the film and its promotion, in all media, worldwide, forever.

The Production will leave the property as it found it, and is responsible for damage it causes. Fee: __________.

Owner signature: ______________________   Date: {{date}}`,

  nda: `NON-DISCLOSURE AGREEMENT

I, {{name}}, will keep confidential everything I learn about {{production}} that isn't public: the script, story, footage, cast, budget and business details.

I won't share it or post about it without written permission from {{company}}, during the production or afterwards, until it is made public by the Production.

Signed: ______________________   Date: {{date}}`,
};

export function templateFor(p: Project, kind: PaperKind): string | undefined {
  return p.budget.templates?.[kind] ?? T[kind];
}

export const builtInTemplate = (kind: PaperKind) => T[kind];

export function fillTemplate(text: string, p: Project, who?: Person, extra: Record<string, string> = {}): string {
  const vals: Record<string, string> = {
    production: p.titlePage.title || p.title,
    company: p.production.company || 'the Production',
    name: who?.name ?? '__________',
    role: who?.role.replace(/^#\d+\s*/, '') ?? '__________',
    location: who?.group === 'Location' ? who.name : '__________',
    date: new Date().toLocaleDateString(),
    rate: '__________', kit: 'none', guarantee: 'none', overtime: 'as agreed', engagement: 'an employee',
    ...extra,
  };
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vals[k] ?? '');
}
