import { describe, expect, it } from 'vitest';
import { createDeck, isNumber } from '../src/cards';
import { arrangements, evaluate } from '../src/equation';
import { settle } from '../src/settle';
import type { Contender } from '../src/settle';
import type { BetType, Card } from '../src/types';
import { buildEquation, resolveEquationsAndDistributePot } from './oracle';
import { mulberry32, randomHand, shuffle, toOriginalCard, toSlots } from './helpers';

const BET_TYPES: BetType[] = ['small', 'big', 'both'];

/** random showdown: players with dealt-style hands and random valid equations */
function scenario(rng: () => number, lowValues: boolean) {
  const players = 2 + Math.floor(rng() * (lowValues ? 3 : 5));
  const nums = shuffle(createDeck(rng).filter(isNumber), rng).filter((c) => !lowValues || (c as any).value <= 3);
  const mode = rng();
  const contenders: Contender[] = [];
  const oraclePlayers: any[] = [];
  const pot = Math.floor(rng() * 600);

  for (let p = 0; p < players; p++) {
    const hand = randomHand(rng, {
      sqrts: rng() < 0.25 ? 1 : 0,
      swap: rng() < 0.4,
      pool: nums.slice(p * 4, p * 4 + 4),
    });
    const all = arrangements(hand);
    if (all.length === 0) return null;
    // mode biases: sometimes everyone bets the same side so the all-small / all-big branches get covered
    const betType: BetType = mode < 0.15 ? 'small' : mode < 0.3 ? 'big' : BET_TYPES[Math.floor(rng() * 3)];
    const pick = () => all[Math.floor(rng() * all.length)];
    const smallSeq = betType !== 'big' ? pick() : undefined;
    const bigSeq = betType !== 'small' ? pick() : undefined;
    const dealt = hand.filter((c) => isNumber(c) || (c.kind === 'op' && c.op === 'sqrt'));
    contenders.push({
      id: `p${p}`,
      betType,
      cards: dealt,
      small: smallSeq && evaluate(smallSeq)!,
      big: bigSeq && evaluate(bigSeq)!,
    });
    oraclePlayers.push({
      id: `p${p}`,
      name: `P${p}`,
      isFolded: false,
      betType,
      chips: 0,
      cards: dealt.map(toOriginalCard),
      submittedEquations: {
        small: smallSeq && buildEquation(toSlots(smallSeq)),
        big: bigSeq && buildEquation(toSlots(bigSeq)),
      },
    });
  }
  return { contenders, oraclePlayers, pot };
}

describe('differential: settle() vs the original payout code', () => {
  it('pays out identically across thousands of random showdowns', () => {
    const rng = mulberry32(31337);
    const seen: Record<string, number> = {};
    let ties = 0;
    let n = 0;
    for (let i = 0; i < 4000; i++) {
      const sc = scenario(rng, i % 3 === 0);
      if (!sc) continue;
      const game: any = { pot: sc.pot, players: sc.oraclePlayers, winners: { small: [], big: [] } };
      resolveEquationsAndDistributePot(game);
      const old: Record<string, number> = {};
      for (const p of game.players) old[p.id] = p.chips;

      const mine = settle(sc.contenders, sc.pot);
      seen[mine.branch] = (seen[mine.branch] ?? 0) + 1;
      if (mine.smallTie.length || mine.bigTie.length) ties++;

      const mineChips: Record<string, number> = {};
      for (const c of sc.contenders) mineChips[c.id] = mine.payouts[c.id] ?? 0;

      if (mine.branch === 'split-fallback') {
        // the ONE deliberate deviation: the original lost the pot here
        expect(Object.values(old).reduce((a, b) => a + b, 0)).toBe(0);
        expect(Object.values(mineChips).reduce((a, b) => a + b, 0)).toBe(sc.pot);
      } else {
        expect(mineChips).toEqual(old);
      }
      n++;
    }
    // make sure the fuzz actually reached every branch and exercised tiebreaks
    expect(n).toBeGreaterThan(3000);
    for (const b of ['all-small', 'all-big', 'both-sweep', 'both-lost', 'split']) {
      expect(seen[b] ?? 0, `branch ${b}`).toBeGreaterThan(20);
    }
    expect(ties).toBeGreaterThan(30);
  });
});

describe('settle: hand-written cases', () => {
  const nc = (value: number, color: 'gold' | 'silver' | 'bronze' | 'dark'): Card => ({
    id: `n${value}${color[0]}`,
    kind: 'number',
    value,
    color,
  });

  it('all-small: the closest to 1 takes the whole pot', () => {
    const r = settle(
      [
        { id: 'a', betType: 'small', cards: [nc(5, 'gold')], small: 3 },
        { id: 'b', betType: 'small', cards: [nc(6, 'gold')], small: 1.5 },
      ],
      100,
    );
    expect(r.payouts).toEqual({ b: 100 });
  });

  it('mixed small and big split the pot, floor to small and ceil to big', () => {
    const r = settle(
      [
        { id: 'a', betType: 'small', cards: [nc(5, 'gold')], small: 1 },
        { id: 'b', betType: 'big', cards: [nc(6, 'gold')], big: 20 },
      ],
      101,
    );
    expect(r.payouts).toEqual({ a: 50, b: 51 });
  });

  it('a "both" bettor who wins only one pool loses, and the small winner takes everything', () => {
    const r = settle(
      [
        { id: 'a', betType: 'small', cards: [nc(5, 'gold')], small: 1 },
        { id: 'b', betType: 'both', cards: [nc(6, 'gold')], small: 2, big: 20 },
        { id: 'c', betType: 'big', cards: [nc(1, 'gold')], big: 12 },
      ],
      90,
    );
    expect(r.branch).toBe('both-lost');
    expect(r.payouts).toEqual({ a: 90 });
  });

  it('small tie: the lowest card wins, lower colour on equal numbers', () => {
    const r = settle(
      [
        { id: 'a', betType: 'small', cards: [nc(2, 'gold'), nc(9, 'gold')], small: 1 },
        { id: 'b', betType: 'small', cards: [nc(2, 'dark'), nc(8, 'gold')], small: 1 },
      ],
      10,
    );
    expect(r.payouts).toEqual({ b: 10 });
  });

  it('big tie: the highest card wins, higher colour on equal numbers', () => {
    const r = settle(
      [
        { id: 'a', betType: 'big', cards: [nc(10, 'silver')], big: 20 },
        { id: 'b', betType: 'big', cards: [nc(10, 'gold')], big: 20 },
      ],
      10,
    );
    expect(r.payouts).toEqual({ b: 10 });
  });

  it('both-bettors who each won one pool: pot is split instead of vanishing', () => {
    const r = settle(
      [
        { id: 'a', betType: 'both', cards: [nc(5, 'gold')], small: 1, big: 15 },
        { id: 'b', betType: 'both', cards: [nc(6, 'gold')], small: 2, big: 20 },
      ],
      10,
    );
    expect(r.branch).toBe('split-fallback');
    expect(r.payouts).toEqual({ a: 5, b: 5 });
  });
});
