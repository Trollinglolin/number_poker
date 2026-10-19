import { describe, expect, it } from 'vitest';
import { analyze, arrangements, evaluate, hasValidEquation, validateEquation } from '../src/equation';
import type { Card } from '../src/types';
import { buildEquation, calculateEquationResult, safeEval } from './oracle';
import { mulberry32, randomHand, shuffle, toSlots } from './helpers';

const num = (value: number, color: 'gold' | 'silver' | 'bronze' | 'dark' = 'gold', id?: string): Card => ({
  id: id ?? `n${value}${color[0]}`,
  kind: 'number',
  value,
  color,
});
const op = (o: 'add' | 'subtract' | 'multiply' | 'divide' | 'sqrt', id = o): Card => ({ id, kind: 'op', op: o });

describe('evaluate: unit cases', () => {
  it('uses normal precedence, left to right', () => {
    expect(evaluate([num(2), op('add'), num(3), op('multiply'), num(4)])).toBe(14);
    expect(evaluate([num(10), op('subtract'), num(4), op('subtract'), num(3)])).toBe(3);
    expect(evaluate([num(8), op('divide'), num(2), op('multiply'), num(3)])).toBe(12);
  });
  it('applies a square root to the single number after it', () => {
    expect(evaluate([num(1), op('add'), op('sqrt'), num(9, 'silver')])).toBe(4);
    expect(evaluate([num(2), op('multiply'), op('sqrt'), num(9, 'silver')])).toBe(6);
  });
  it('rejects division by zero', () => {
    expect(evaluate([num(4), op('divide'), num(0, 'dark')])).toBeNull();
    expect(evaluate([num(0, 'dark'), op('divide'), num(0, 'gold')])).toBeNull();
  });
});

describe('analyze: the original structure rules', () => {
  const total = 5;
  it('needs a number first and last', () => {
    expect(analyze([op('add'), num(1), num(2), num(3), num(4)], total).problems[0]).toMatch(/Start with a number/);
    expect(analyze([num(1), op('add'), num(2), op('add'), op('subtract')], total).problems.join()).toMatch(/End with a number/);
  });
  it('flags adjacent numbers and adjacent operators, but allows operator then sqrt', () => {
    expect(analyze([num(1), num(2)], 2).problems[0]).toMatch(/Two numbers/);
    expect(analyze([num(1), op('add'), op('subtract'), num(2)], 4).problems[0]).toMatch(/Two operators/);
    expect(analyze([num(1), op('add'), op('sqrt'), num(4)], 4).problems).toEqual([]);
    expect(analyze([num(1), op('add'), op('sqrt'), op('sqrt'), num(4)], 5).problems.length).toBeGreaterThan(0);
  });
});

describe('validateEquation (server side)', () => {
  const hand = [num(3), num(5, 'silver'), num(2, 'bronze'), num(9, 'dark'), op('add'), op('subtract'), op('divide')];
  it('accepts a full valid arrangement', () => {
    const r = validateEquation(hand, ['n3g', 'add', 'n5s', 'subtract', 'n2b', 'divide', 'n9d']);
    expect(r.ok).toBe(true);
  });
  it('rejects missing, duplicated and foreign cards', () => {
    expect(validateEquation(hand, ['n3g', 'add', 'n5s']).ok).toBe(false);
    expect(validateEquation(hand, ['n3g', 'add', 'n3g', 'subtract', 'n2b', 'divide', 'n9d']).ok).toBe(false);
    expect(validateEquation(hand, ['n3g', 'add', 'n5s', 'subtract', 'n2b', 'divide', 'zzz']).ok).toBe(false);
  });
  it('rejects division by zero', () => {
    const h = [num(4), num(0, 'dark'), num(1, 'bronze'), num(2, 'silver'), op('add'), op('subtract'), op('divide')];
    expect(validateEquation(h, ['n4g', 'divide', 'n0d', 'add', 'n1b', 'subtract', 'n2s']).ok).toBe(false);
  });
});

describe('hands with no valid equation', () => {
  it('four square roots cannot all be used', () => {
    const hand = randomHand(mulberry32(1), { sqrts: 4 });
    expect(hasValidEquation(hand)).toBe(false);
  });
  it('four zeros force a divide by zero', () => {
    const hand: Card[] = [
      num(0, 'gold'),
      num(0, 'silver'),
      num(0, 'bronze'),
      num(0, 'dark'),
      op('add'),
      op('subtract'),
      op('divide'),
    ];
    expect(hasValidEquation(hand)).toBe(false);
  });
  it('three zeros and one real number is still playable', () => {
    const hand: Card[] = [num(0, 'gold'), num(0, 'silver'), num(0, 'bronze'), num(5, 'dark'), op('add'), op('subtract'), op('divide')];
    expect(hasValidEquation(hand)).toBe(true);
  });
  it('up to three square roots are always playable', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 60; i++) {
      const hand = randomHand(rng, { sqrts: 3, swap: rng() < 0.5, maxValue: 10 });
      // only impossible when every number is zero, which a 3-sqrt hand cannot dodge by luck here
      if (hand.filter((c) => c.kind === 'number' && c.value !== 0).length > 0) {
        expect(hasValidEquation(hand)).toBe(true);
      }
    }
  });
});

describe('differential: new evaluator vs the original code', () => {
  it('matches the original on every random valid arrangement (value, via old safeEval and old client calc)', () => {
    const rng = mulberry32(2024);
    let checked = 0;
    for (let n = 0; n < 400; n++) {
      const hand = randomHand(rng, { sqrts: Math.floor(rng() * 4), swap: rng() < 0.5, maxValue: rng() < 0.3 ? 3 : 10, pool: shuffle(
        // every number card, shuffled
        randomHandPool(rng),
        rng,
      ) });
      const all = arrangements(hand);
      if (all.length === 0) continue;
      for (let s = 0; s < 6; s++) {
        const seq = all[Math.floor(rng() * all.length)];
        const slots = toSlots(seq);
        const serverString = buildEquation(slots);
        expect(serverString).not.toBeNull();
        const old = safeEval(serverString);
        const client = calculateEquationResult(slots);
        const mine = evaluate(seq);
        expect(mine).toBe(old);
        expect(mine).toBe(client);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1500);
  });

  it('accepts exactly the same arrangements as the original (exhaustive over all card orders)', () => {
    const rng = mulberry32(7);
    for (let n = 0; n < 12; n++) {
      const hand = randomHand(rng, {
        sqrts: n % 3 === 0 ? 1 : 0,
        swap: n % 2 === 0,
        maxValue: n % 4 === 0 ? 2 : 10, // small values make zero denominators common
        pool: shuffle(randomHandPool(rng), rng),
      });
      const mine = new Set(arrangements(hand).map((seq) => seq.map((c) => c.id).join(',')));
      const theirs = new Set<string>();
      for (const perm of permute(hand)) {
        const slots = toSlots(perm);
        const str = buildEquation(slots);
        if (str === null) continue;
        const a = calculateEquationResult(slots);
        const b = safeEval(str);
        if (a !== null && b !== null) theirs.add(perm.map((c) => c.id).join(','));
      }
      expect(mine).toEqual(theirs);
      expect(mine.size).toBeGreaterThan(0);
    }
  });
});

function randomHandPool(rng: () => number): Card[] {
  const out: Card[] = [];
  for (const color of ['gold', 'silver', 'bronze', 'dark'] as const) {
    for (let value = 0; value <= 10; value++) out.push(num(value, color));
  }
  return shuffle(out, rng);
}

function* permute<T>(items: T[]): Generator<T[]> {
  const a = items.slice();
  const n = a.length;
  const c = new Array(n).fill(0);
  yield a.slice();
  let i = 0;
  while (i < n) {
    if (c[i] < i) {
      if (i % 2 === 0) [a[0], a[i]] = [a[i], a[0]];
      else [a[c[i]], a[i]] = [a[i], a[c[i]]];
      yield a.slice();
      c[i] += 1;
      i = 0;
    } else {
      c[i] = 0;
      i += 1;
    }
  }
}
