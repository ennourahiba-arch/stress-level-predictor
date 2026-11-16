// Exact, offline answer checker for typed Calculus answers.
//
// What it can PROVE: equality of Laurent polynomials in x with rational
// coefficients (sums of c·x^k, k any integer), after expanding products and
// integer powers. All arithmetic is exact (BigInt fractions), so 0.333 is never
// mistaken for 1/3. Anything outside that class (sin, sqrt, dividing by x+1, …)
// is reported as "unsupported" and never given a definitive grade.
//
// Cross-validated against SymPy by mathcheck.test.ts using vectors generated in
// content/catchai/exercises.py.

// ---------- exact rationals ----------
export class Q {
  readonly n: bigint;
  readonly d: bigint;
  constructor(n: bigint, d: bigint = 1n) {
    if (d === 0n) throw new CheckError("unsupported", "Division by zero.");
    if (d < 0n) { n = -n; d = -d; }
    const g = gcd(n < 0n ? -n : n, d);
    this.n = g ? n / g : n;
    this.d = g ? d / g : d;
  }
  static parse(s: string): Q {
    if (s.length > 30) throw new CheckError("unsupported", "That number is too long to check.");
    const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(s);
    if (!m || (m[2] === "" && !m[3])) throw new CheckError("syntax", "Couldn't read the number “{s}”.", { s });
    const frac = m[3] ?? "";
    const n = BigInt((m[2] || "0") + frac) * (m[1] ? -1n : 1n);
    return new Q(n, 10n ** BigInt(frac.length));
  }
  static of(s: string): Q {
    const [a, b] = s.split("/");
    return new Q(BigInt(a), b ? BigInt(b) : 1n);
  }
  add(o: Q) { return new Q(this.n * o.d + o.n * this.d, this.d * o.d); }
  mul(o: Q) { return new Q(this.n * o.n, this.d * o.d); }
  neg() { return new Q(-this.n, this.d); }
  inv() { return new Q(this.d, this.n); }
  isZero() { return this.n === 0n; }
  eq(o: Q) { return this.n === o.n && this.d === o.d; }
  isInt() { return this.d === 1n; }
  key() { return `${this.n}/${this.d}`; }
  latex(): string {
    if (this.d === 1n) return this.n.toString();
    const neg = this.n < 0n;
    return `${neg ? "-" : ""}\\frac{${neg ? -this.n : this.n}}{${this.d}}`;
  }
}
function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b];
  return a;
}

export class CheckError extends Error {
  /** message is an English key; params fill its {placeholders} when it's translated for display. */
  constructor(public kind: "syntax" | "unsupported", message: string, public params?: Record<string, string>) { super(message); }
}

// ---------- Laurent polynomials: exponent -> coefficient ----------
export type Poly = Map<number, Q>;
const MAX_EXP = 60;
const MAX_POW = 12;

const constant = (q: Q): Poly => (q.isZero() ? new Map() : new Map([[0, q]]));
function clean(p: Poly): Poly {
  for (const [k, v] of p) if (v.isZero()) p.delete(k);
  return p;
}
function add(a: Poly, b: Poly): Poly {
  const r = new Map(a);
  for (const [k, v] of b) r.set(k, (r.get(k) ?? new Q(0n)).add(v));
  return clean(r);
}
const neg = (a: Poly): Poly => new Map([...a].map(([k, v]) => [k, v.neg()]));
function mul(a: Poly, b: Poly): Poly {
  const r: Poly = new Map();
  for (const [i, u] of a) for (const [j, v] of b) {
    const k = i + j;
    if (Math.abs(k) > MAX_EXP) throw new CheckError("unsupported", "That expression has powers too large to check.");
    r.set(k, (r.get(k) ?? new Q(0n)).add(u.mul(v)));
  }
  return clean(r);
}
const isConst = (p: Poly) => [...p.keys()].every((k) => k === 0);
const constValue = (p: Poly) => p.get(0) ?? new Q(0n);

function divide(a: Poly, b: Poly): Poly {
  if (b.size !== 1) {
    throw new CheckError("unsupported", "I can only check division by a number or a power of x (like 6/x^4). Expand or simplify that part first.");
  }
  const [[k, c]] = [...b];
  return mul(a, new Map([[-k, c.inv()]]));
}
function power(base: Poly, e: Poly): Poly {
  if (!isConst(e) || !constValue(e).isInt()) {
    throw new CheckError("unsupported", "Exponents must be whole numbers, like x^3 or x^(-2).");
  }
  const n = Number(constValue(e).n);
  if (n >= 0) {
    if (n > MAX_POW) throw new CheckError("unsupported", "That power is too large to expand and check.");
    let r: Poly = constant(new Q(1n));
    for (let i = 0; i < n; i++) r = mul(r, base);
    return r;
  }
  if (base.size !== 1) {
    throw new CheckError("unsupported", "Negative powers are supported for a single term like x^(-3), not for brackets like (x+1)^(-1).");
  }
  const [[k, c]] = [...base];
  let cc = new Q(1n);
  for (let i = 0; i < -n; i++) cc = cc.mul(c.inv());
  if (Math.abs(k * n) > MAX_EXP) throw new CheckError("unsupported", "That expression has powers too large to check.");
  return new Map([[k * n, cc]]);
}

// ---------- parser ----------
type Tok = { t: "num"; v: string } | { t: "x" } | { t: "op"; v: string };

function normalise(s: string): string {
  return s
    .replace(/\*\*/g, "^")
    .replace(/[−–]/g, "-")
    .replace(/[×·⋅]/g, "*")
    .replace(/÷/g, "/")
    .replace(/²/g, "^2").replace(/³/g, "^3").replace(/⁴/g, "^4")
    .replace(/X/g, "x");
}

function tokenize(input: string): Tok[] {
  const s = normalise(input);
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      out.push({ t: "num", v: s.slice(i, j) });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      let j = i;
      while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
      const word = s.slice(i, j);
      if (word === "x") { out.push({ t: "x" }); i = j; continue; }
      throw new CheckError("unsupported", "This checker works with polynomials and powers of x, so it can't verify “{word}”. Write the answer without it.", { word });
    }
    if ("+-*/^()".includes(ch)) { out.push({ t: "op", v: ch }); i++; continue; }
    throw new CheckError("syntax", "Unexpected character “{ch}”.", { ch });
  }
  // implicit multiplication: 3x, 2(x+1), x(x+1), (x+1)(x-1), (x+1)2 is not allowed
  const res: Tok[] = [];
  for (const tk of out) {
    const prev = res[res.length - 1];
    const prevEnds = prev && (prev.t === "num" || prev.t === "x" || (prev.t === "op" && prev.v === ")"));
    const curStarts = tk.t === "x" || (tk.t === "op" && tk.v === "(");
    if (prevEnds && curStarts) res.push({ t: "op", v: "*" });
    res.push(tk);
  }
  return res;
}

class Parser {
  i = 0;
  constructor(private toks: Tok[]) {}
  peek() { return this.toks[this.i]; }
  isOp(v: string) { const t = this.peek(); return t && t.t === "op" && t.v === v; }
  expect(v: string) {
    if (!this.isOp(v)) throw new CheckError("syntax", v === ")" ? "A bracket is missing a closing )." : "Expected “{v}”.", v === ")" ? undefined : { v });
    this.i++;
  }
  parse(): Poly {
    if (!this.toks.length) throw new CheckError("syntax", "Type an answer first.");
    const p = this.expr();
    if (this.i < this.toks.length) throw new CheckError("syntax", "Couldn't read the end of your answer. Check for a stray symbol or bracket.");
    return p;
  }
  expr(): Poly {
    let p = this.term();
    while (this.isOp("+") || this.isOp("-")) {
      const op = (this.toks[this.i++] as { v: string }).v;
      const r = this.term();
      p = op === "+" ? add(p, r) : add(p, neg(r));
    }
    return p;
  }
  term(): Poly {
    let p = this.unary();
    while (this.isOp("*") || this.isOp("/")) {
      const op = (this.toks[this.i++] as { v: string }).v;
      const r = this.unary();
      p = op === "*" ? mul(p, r) : divide(p, r);
    }
    return p;
  }
  unary(): Poly {
    if (this.isOp("-")) { this.i++; return neg(this.unary()); }
    if (this.isOp("+")) { this.i++; return this.unary(); }
    return this.pow();
  }
  pow(): Poly {
    const base = this.atom();
    if (this.isOp("^")) {
      this.i++;
      return power(base, this.unary()); // allows x^-3 and x^(-3)
    }
    return base;
  }
  atom(): Poly {
    const t = this.peek();
    if (!t) throw new CheckError("syntax", "Your answer ends too early.");
    if (t.t === "num") { this.i++; return constant(Q.parse(t.v)); }
    if (t.t === "x") { this.i++; return new Map([[1, new Q(1n)]]); }
    if (t.v === "(") { this.i++; const p = this.expr(); this.expect(")"); return p; }
    throw new CheckError("syntax", "Unexpected “{v}”.", { v: t.v });
  }
}

export function parsePoly(input: string): Poly {
  return new Parser(tokenize(input)).parse();
}

export function polyEqual(a: Poly, b: Poly): boolean {
  const d = add(a, neg(b));
  return d.size === 0;
}

export function polyFromCoeffs(coeffs: Record<string, string>): Poly {
  return clean(new Map(Object.entries(coeffs).map(([k, v]) => [Number(k), Q.of(v)])));
}

export function polyLatex(p: Poly): string {
  const terms = [...p].sort((a, b) => b[0] - a[0]);
  if (!terms.length) return "0";
  return terms.map(([k, c], idx) => {
    const negative = c.n < 0n;
    const abs = negative ? c.neg() : c;
    const coef = k !== 0 && abs.eq(new Q(1n)) ? "" : abs.latex();
    const xs = k === 0 ? "" : k === 1 ? "x" : `x^{${k}}`;
    const sign = idx === 0 ? (negative ? "-" : "") : negative ? " - " : " + ";
    return `${sign}${coef}${xs}`;
  }).join("");
}

// ---------- verdicts ----------
export type Verdict =
  | { status: "correct" | "incorrect"; preview: string }
  | { status: "syntax" | "unsupported"; message: string; params?: Record<string, string> };

function guard<T>(fn: () => T): T | Verdict {
  try { return fn(); } catch (e) {
    if (e instanceof CheckError) return { status: e.kind, message: e.message, params: e.params };
    return { status: "unsupported", message: "This answer couldn't be checked safely. Try writing it another way." };
  }
}
const isVerdict = (v: unknown): v is Verdict => typeof v === "object" && v !== null && "status" in v;

export function checkExpression(input: string, coeffs: Record<string, string>): Verdict {
  const p = guard(() => parsePoly(input));
  if (isVerdict(p)) return p;
  return { status: polyEqual(p, polyFromCoeffs(coeffs)) ? "correct" : "incorrect", preview: polyLatex(p) };
}

export function parseNumbers(input: string): Q[] {
  const parts = input.split(/,|;|\band\b/).map((s) => s.trim().replace(/^x\s*=\s*/i, "")).filter(Boolean);
  if (!parts.length) throw new CheckError("syntax", "Type at least one value.");
  return parts.map((s) => {
    const p = parsePoly(s);
    if (!isConst(p)) throw new CheckError("syntax", "“{s}” should be a number, not an expression in x.", { s });
    return constValue(p);
  });
}

const sameSet = (a: Q[], b: Q[]) => {
  const A = new Set(a.map((q) => q.key()));
  const B = new Set(b.map((q) => q.key()));
  return A.size === B.size && [...A].every((k) => B.has(k));
};
const numsLatex = (a: Q[]) => [...new Map(a.map((q) => [q.key(), q])).values()].map((q) => `x = ${q.latex()}`).join(",\\; ");

export function checkPoints(input: string, values: string[]): Verdict {
  const got = guard(() => parseNumbers(input));
  if (isVerdict(got)) return got;
  return { status: sameSet(got, values.map(Q.of)) ? "correct" : "incorrect", preview: numsLatex(got) };
}

export function checkExtremum(valueInput: string, atInput: string, answer: { value: string; at: string[] }): Verdict {
  const v = guard(() => parseNumbers(valueInput));
  if (isVerdict(v)) return v;
  if (v.length !== 1) return { status: "syntax", message: "Enter a single value for the maximum or minimum." };
  const at = guard(() => parseNumbers(atInput));
  if (isVerdict(at)) return at;
  const ok = v[0].eq(Q.of(answer.value)) && sameSet(at, answer.at.map(Q.of));
  return { status: ok ? "correct" : "incorrect", preview: `${v[0].latex()} \\text{ at } ${numsLatex(at)}` };
}
