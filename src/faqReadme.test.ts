import { describe, expect, it } from 'vitest';
import { faqMarkdown } from './reference/faq';

// The README's FAQ (the repo page on GitHub) must match the app's. To update it after changing
// src/reference/faq.ts: `npm run faq` (rewrites the part of README.md between the faq markers).

const START = '<!-- faq:start -->', END = '<!-- faq:end -->';

describe('the repo page FAQ', () => {
  it('matches the FAQ in the app', async () => {
    const fs = await import('node:fs' as string) as { readFileSync: (p: string, e: string) => string; writeFileSync: (p: string, d: string) => void };
    const proc = (globalThis as { process?: { cwd: () => string; env: Record<string, string | undefined> } }).process!;
    const path = `${proc.cwd()}/README.md`;
    const readme = fs.readFileSync(path, 'utf8');
    const want = `${START}\n${faqMarkdown()}${END}`;
    const has = readme.slice(readme.indexOf(START), readme.indexOf(END) + END.length);
    if (proc.env.UPDATE_FAQ && has !== want) {
      fs.writeFileSync(path, readme.replace(has, want));
      return;
    }
    expect(readme.includes(START) && readme.includes(END)).toBe(true);
    expect(has).toBe(want);
  });
});
