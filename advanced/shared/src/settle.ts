import { COLOR_RANK, numberCards } from './cards';
import type { BetType, Card } from './types';

/**
 * Pot distribution, ported branch for branch from the original resolveEquationsAndDistributePot.
 *
 * Winner per pool: the closest value to the target (exact float comparison, as before).
 * Ties: the key for a card is value * 10 + colour rank (dark 0, bronze 1, silver 2, gold 3).
 *   small pool: the player holding the LOWEST key among their number cards wins
 *   big pool:   the player holding the HIGHEST key among their number cards wins
 */

export interface Contender {
  id: string;
  betType: BetType;
  /** the player's dealt cards, used for the tiebreak */
  cards: Card[];
  small?: number;
  big?: number;
}

export type Branch = 'all-small' | 'all-big' | 'both-sweep' | 'both-lost' | 'split' | 'split-fallback';

export interface Settlement {
  branch: Branch;
  smallWinnerId?: string;
  bigWinnerId?: string;
  /** "bet both" players who did not win both pools */
  bothLoserIds: string[];
  payouts: Record<string, number>;
  /** players who tied on distance in a pool and were separated by card colour */
  smallTie: string[];
  bigTie: string[];
}

const key = (c: { value: number; color: keyof typeof COLOR_RANK }) => c.value * 10 + COLOR_RANK[c.color];

function lowestKey(cards: Card[]): number {
  const nums = numberCards(cards);
  return nums.length === 0 ? Infinity : Math.min(...nums.map(key));
}
function highestKey(cards: Card[]): number {
  const nums = numberCards(cards);
  return nums.length === 0 ? -Infinity : Math.max(...nums.map(key));
}

function closest(
  contenders: Contender[],
  pick: (c: Contender) => number | undefined,
  target: number,
): Contender[] {
  let min = Infinity;
  let winners: Contender[] = [];
  for (const c of contenders) {
    const v = pick(c);
    if (typeof v !== 'number') continue;
    const diff = Math.abs(v - target);
    if (diff < min) {
      min = diff;
      winners = [c];
    } else if (diff === min) {
      winners.push(c);
    }
  }
  return winners;
}

export function settle(contenders: Contender[], pot: number): Settlement {
  const smallTied = closest(contenders, (c) => c.small, 1);
  const bigTied = closest(contenders, (c) => c.big, 20);

  const smallWinner = smallTied.length
    ? smallTied.reduce((w, c) => (lowestKey(c.cards) < lowestKey(w.cards) ? c : w))
    : undefined;
  const bigWinner = bigTied.length
    ? bigTied.reduce((w, c) => (highestKey(c.cards) > highestKey(w.cards) ? c : w))
    : undefined;

  const allSmall = contenders.every((c) => c.betType === 'small');
  const allBig = contenders.every((c) => c.betType === 'big');

  const bothLosers = contenders.filter((c) => {
    if (c.betType !== 'both') return false;
    const lostSmall = typeof c.small === 'number' && smallWinner && smallWinner.id !== c.id;
    const lostBig = typeof c.big === 'number' && bigWinner && bigWinner.id !== c.id;
    return Boolean(lostSmall || lostBig);
  });
  const isLoser = (id: string) => bothLosers.some((l) => l.id === id);

  const payouts: Record<string, number> = {};
  const give = (id: string, amount: number) => {
    payouts[id] = (payouts[id] ?? 0) + amount;
  };
  let branch: Branch;

  if (allSmall && smallWinner) {
    branch = 'all-small';
    give(smallWinner.id, pot);
  } else if (allBig && bigWinner) {
    branch = 'all-big';
    give(bigWinner.id, pot);
  } else if (smallWinner && bigWinner && smallWinner.id === bigWinner.id) {
    branch = 'both-sweep';
    give(smallWinner.id, pot);
  } else if (bothLosers.length > 0) {
    if (smallWinner && !isLoser(smallWinner.id)) {
      branch = 'both-lost';
      give(smallWinner.id, pot);
    } else if (bigWinner && !isLoser(bigWinner.id)) {
      branch = 'both-lost';
      give(bigWinner.id, pot);
    } else {
      // Deliberate deviation: the original dropped the pot here (chips vanished).
      // Both pool winners are "bet both" players who each lost the other pool, so split.
      branch = 'split-fallback';
      splitPot(pot, smallWinner?.id, bigWinner?.id, give);
    }
  } else {
    branch = 'split';
    splitPot(pot, smallWinner?.id, bigWinner?.id, give);
  }

  return {
    branch,
    smallWinnerId: smallWinner?.id,
    bigWinnerId: bigWinner?.id,
    bothLoserIds: bothLosers.map((l) => l.id),
    payouts,
    smallTie: smallTied.length > 1 ? smallTied.map((c) => c.id) : [],
    bigTie: bigTied.length > 1 ? bigTied.map((c) => c.id) : [],
  };
}

/** small winner gets floor(pot / 2), big winner gets ceil(pot / 2), as before */
function splitPot(
  pot: number,
  smallId: string | undefined,
  bigId: string | undefined,
  give: (id: string, amount: number) => void,
) {
  if (smallId && bigId) {
    give(smallId, Math.floor(pot / 2));
    give(bigId, Math.ceil(pot / 2));
  } else if (smallId || bigId) {
    // a lone winner takes the lot (unreachable with validated submissions)
    give((smallId ?? bigId)!, pot);
  }
}
