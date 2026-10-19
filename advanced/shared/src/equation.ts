import { OP_SYMBOL, isBinary, isNumber, isSqrt } from './cards';
import type { Card, NumberCard, OpCard } from './types';

/**
 * Equation rules, ported from the original EquationBuilder:
 *  - the first and last card must be numbers
 *  - no two number cards in a row
 *  - no two operators in a row, except a binary operator followed by a square root
 *  - a square root applies to the single number card right after it
 *  - evaluation follows normal JavaScript precedence (x and / before + and -), no brackets
 *  - the result must be a finite number
 */

export interface Analysis {
  /** every card has been placed */
  complete: boolean;
  /** plain-language reasons the current order is not a valid equation */
  problems: string[];
  /** value of the equation when the order is valid, otherwise null */
  value: number | null;
  expr: string;
}

export function evaluate(ordered: Card[]): number | null {
  const vals: number[] = [];
  const ops: OpCard[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const c = ordered[i];
    if (isNumber(c)) {
      vals.push(c.value);
    } else if (isSqrt(c)) {
      const next = ordered[i + 1];
      if (!next || !isNumber(next)) return null;
      vals.push(Math.sqrt(next.value));
      i++;
    } else {
      ops.push(c);
    }
  }
  if (vals.length === 0 || vals.length !== ops.length + 1) return null;

  // multiplicative pass, then additive pass, both left to right (same order JavaScript uses)
  const terms: number[] = [vals[0]];
  const signs: ('add' | 'subtract')[] = [];
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k].op;
    const v = vals[k + 1];
    if (op === 'multiply') terms[terms.length - 1] = terms[terms.length - 1] * v;
    else if (op === 'divide') terms[terms.length - 1] = terms[terms.length - 1] / v;
    else {
      signs.push(op as 'add' | 'subtract');
      terms.push(v);
    }
  }
  let result = terms[0];
  for (let j = 0; j < signs.length; j++) {
    result = signs[j] === 'add' ? result + terms[j + 1] : result - terms[j + 1];
  }
  return Number.isFinite(result) ? result : null;
}

export function formatExpr(ordered: Card[]): string {
  let out = '';
  for (const c of ordered) {
    if (isNumber(c)) out += String(c.value);
    else if (isSqrt(c)) out += ' ' + OP_SYMBOL.sqrt;
    else out += ' ' + OP_SYMBOL[c.op] + ' ';
  }
  // a sqrt sits right before its number: "3 + √5", not "3 + √ 5"
  return out.replace(/ {2,}/g, ' ').replace(/√ /g, '√').trim();
}

export function analyze(ordered: Card[], totalCards: number): Analysis {
  const problems: string[] = [];
  const complete = ordered.length === totalCards;
  if (ordered.length > 0) {
    if (!isNumber(ordered[0])) problems.push('Start with a number card.');
    for (let i = 0; i < ordered.length - 1; i++) {
      const a = ordered[i];
      const b = ordered[i + 1];
      if (isNumber(a) && isNumber(b)) {
        problems.push('Two numbers in a row need an operator between them.');
      } else if (isNumber(a) && isSqrt(b)) {
        // the original only failed this later, as a JavaScript syntax error
        problems.push('A square root needs an operator before it.');
      } else if (!isNumber(a) && !isNumber(b)) {
        if (isSqrt(a)) problems.push('A square root needs a number right after it.');
        else if (!isSqrt(b)) problems.push('Two operators in a row. Only a square root can follow one.');
      }
    }
    const last = ordered[ordered.length - 1];
    if (complete && !isNumber(last)) problems.push('End with a number card.');
  }
  const unique = [...new Set(problems)];
  const structurallyOk = unique.length === 0;
  const endsOnNumber = ordered.length > 0 && isNumber(ordered[ordered.length - 1]);
  const value = structurallyOk && endsOnNumber ? evaluate(ordered) : null;
  if (structurallyOk && endsOnNumber && value === null) {
    unique.push('This works out to an invalid number (division by zero).');
  }
  return { complete, problems: unique, value, expr: formatExpr(ordered) };
}

export type ValidEquation =
  | { ok: true; ordered: Card[]; expr: string; value: number }
  | { ok: false; reason: string };

/** Server-side check: `ids` must use every one of the player's cards exactly once. */
export function validateEquation(hand: Card[], ids: string[]): ValidEquation {
  if (ids.length !== hand.length) return { ok: false, reason: 'Use every card exactly once.' };
  const byId = new Map(hand.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const ordered: Card[] = [];
  for (const id of ids) {
    const card = byId.get(id);
    if (!card || seen.has(id)) return { ok: false, reason: 'Use every card exactly once.' };
    seen.add(id);
    ordered.push(card);
  }
  const a = analyze(ordered, hand.length);
  if (a.problems.length > 0 || a.value === null) {
    return { ok: false, reason: a.problems[0] ?? 'That equation is not valid.' };
  }
  return { ok: true, ordered, expr: a.expr, value: a.value };
}

/**
 * Every valid, finite arrangement that uses all the cards. The hand always has four
 * numbers and three binary operators; each square root sits before a non-first number.
 */
export function arrangements(hand: Card[]): Card[][] {
  const nums = hand.filter(isNumber);
  const bins = hand.filter(isBinary);
  const sqrts = hand.filter(isSqrt);
  const out: Card[][] = [];
  const slots = nums.length - 1;
  if (nums.length < 2 || bins.length !== slots || sqrts.length > slots) return out;

  for (const np of permutations(nums)) {
    for (const bp of permutations(bins)) {
      for (const mask of masks(slots, sqrts.length)) {
        const seq: Card[] = [np[0]];
        let s = 0;
        for (let k = 0; k < slots; k++) {
          seq.push(bp[k]);
          if (mask[k]) seq.push(sqrts[s++]);
          seq.push(np[k + 1]);
        }
        if (evaluate(seq) !== null) out.push(seq);
      }
    }
  }
  return out;
}

export function hasValidEquation(hand: Card[]): boolean {
  return arrangements(hand).length > 0;
}

/** Closest arrangement to a target. Ties resolve to the first one found. */
export function bestArrangement(hand: Card[], target: number): { ordered: Card[]; value: number } | null {
  let best: { ordered: Card[]; value: number } | null = null;
  for (const seq of arrangements(hand)) {
    const value = evaluate(seq)!;
    if (!best || Math.abs(value - target) < Math.abs(best.value - target)) best = { ordered: seq, value };
  }
  return best;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const out: T[][] = [];
  items.forEach((item, i) => {
    const rest = items.slice(0, i).concat(items.slice(i + 1));
    for (const p of permutations(rest)) out.push([item, ...p]);
  });
  return out;
}

/** all boolean masks of length n with exactly k true */
function masks(n: number, k: number): boolean[][] {
  const out: boolean[][] = [];
  for (let m = 0; m < 1 << n; m++) {
    const bits = Array.from({ length: n }, (_, i) => Boolean(m & (1 << i)));
    if (bits.filter(Boolean).length === k) out.push(bits);
  }
  return out;
}

export type { NumberCard };
