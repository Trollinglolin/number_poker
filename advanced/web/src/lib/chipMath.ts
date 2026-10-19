/** casino-style denominations, largest first */
export const DENOMS = [1000, 500, 100, 25, 5, 1] as const;
export type Denom = (typeof DENOMS)[number];

export interface Pile {
  denom: Denom;
  /** chips drawn in this pile (capped: the stack is decoration, the printed number is exact) */
  count: number;
}

/**
 * Break an amount into piles, largest denominations first. Only the biggest few piles are drawn
 * and each is capped in height, so a huge pot stays readable. Never use this for arithmetic.
 */
export function chipBreakdown(amount: number, maxPiles = 3, maxHeight = 6): Pile[] {
  let rest = Math.max(0, Math.floor(amount));
  const piles: Pile[] = [];
  for (const denom of DENOMS) {
    const count = Math.floor(rest / denom);
    if (count > 0) {
      piles.push({ denom, count: Math.min(count, maxHeight) });
      rest -= count * denom;
    }
  }
  return piles.slice(0, maxPiles);
}
