import { baseOps, createDeck, isNumber } from '../src/cards';
import type { Card, OpCard } from '../src/types';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const OP_NAMES: Record<string, string> = {
  add: 'add',
  subtract: 'subtract',
  multiply: 'multiply',
  divide: 'divide',
  sqrt: 'squareRoot',
};

/** convert our cards to the original game's slot format */
export function toSlots(ordered: Card[]) {
  return ordered.map((c) => ({
    card: isNumber(c)
      ? { type: 'number', value: c.value, color: c.color }
      : { type: 'operation', operation: OP_NAMES[c.op] },
  }));
}

export function toOriginalCard(c: Card) {
  return isNumber(c)
    ? { type: 'number', value: c.value, color: c.color }
    : { type: 'operation', operation: OP_NAMES[c.op] };
}

/** a hand shaped like the dealer produces: 4 numbers, 3 binary ops (maybe a swapped multiply), k square roots */
export function randomHand(
  rng: () => number,
  opts: { sqrts?: number; swap?: boolean; maxValue?: number; pool?: Card[] } = {},
): Card[] {
  const deck = (opts.pool ?? createDeck(rng).filter(isNumber)).filter(
    (c) => isNumber(c) && c.value <= (opts.maxValue ?? 10),
  );
  const nums = deck.slice(0, 4);
  let ops: OpCard[] = baseOps();
  const cards: Card[] = [...nums];
  const k = opts.sqrts ?? 0;
  for (let i = 0; i < k; i++) cards.push({ id: `sqrt${i}`, kind: 'op', op: 'sqrt' });
  if (opts.swap) {
    const drop = rng() < 0.5 ? 'add' : 'subtract';
    ops = ops.filter((o) => o.op !== drop);
    cards.push({ id: 'mul0', kind: 'op', op: 'multiply' });
  }
  return cards.concat(ops);
}

export function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
