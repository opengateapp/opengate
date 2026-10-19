// Tiny, safe arithmetic for budget lines: numbers, named numbers (SHOOT_WEEKS, CREW…),
// + − × ÷ and parentheses. No eval — a hand-written parser, so a typo can't run code.

export type Vars = Record<string, number>;

export interface ExprResult { value: number; error?: string }

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] | string {
  const out: Tok[] = [];
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '');
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = s.slice(i).match(/^\d*\.?\d+/)!;
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/)!;
      out.push({ t: 'id', v: m[0].toUpperCase() });
      i += m[0].length;
      continue;
    }
    if ('+-*/()'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    return `Unexpected “${c}”`;
  }
  return out;
}

/** Evaluates `src` with named numbers from `vars`. Unknown names are an error, not zero. */
export function evaluate(src: string, vars: Vars): ExprResult {
  const toks = tokenize(src);
  if (typeof toks === 'string') return { value: 0, error: toks };
  let pos = 0;
  const peek = () => toks[pos];
  const take = () => toks[pos++];
  let error: string | undefined;

  const primary = (): number => {
    const tk = take();
    if (!tk) { error ??= 'Unfinished formula'; return 0; }
    if (tk.t === 'num') return tk.v;
    if (tk.t === 'id') {
      if (!(tk.v in vars)) { error ??= `Unknown name ${tk.v}`; return 0; }
      return vars[tk.v];
    }
    if (tk.v === '(') {
      const v = sum();
      if (take()?.v !== ')') error ??= 'Missing )';
      return v;
    }
    if (tk.v === '-') return -primary();
    if (tk.v === '+') return primary();
    error ??= `Unexpected ${tk.v}`;
    return 0;
  };
  const product = (): number => {
    let v = primary();
    while (peek()?.t === 'op' && (peek()!.v === '*' || peek()!.v === '/')) {
      const op = take()!.v;
      const r = primary();
      v = op === '*' ? v * r : r === 0 ? (error ??= 'Divided by zero', 0) as number : v / r;
    }
    return v;
  };
  const sum = (): number => {
    let v = product();
    while (peek()?.t === 'op' && (peek()!.v === '+' || peek()!.v === '-')) {
      const op = take()!.v;
      const r = product();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const value = sum();
  if (pos < toks.length) error ??= 'Unexpected text at the end';
  return { value: Number.isFinite(value) ? value : 0, error };
}

/** A typed quantity: a plain number, or a formula (anything with a name or an operator). */
export const isFormula = (s: string) => /[A-Za-z_()*/+]/.test(s) || /\d\s*-\s*\d/.test(s);
