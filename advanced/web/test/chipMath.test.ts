import { describe, expect, it } from 'vitest';
import { chipBreakdown } from '../src/lib/chipMath';

describe('chipBreakdown (display only)', () => {
  it('draws nothing for an empty bet', () => {
    expect(chipBreakdown(0)).toEqual([]);
    expect(chipBreakdown(-5)).toEqual([]);
  });

  it('uses the largest denominations first', () => {
    expect(chipBreakdown(1)).toEqual([{ denom: 1, count: 1 }]);
    expect(chipBreakdown(30)).toEqual([
      { denom: 25, count: 1 },
      { denom: 5, count: 1 },
    ]);
    expect(chipBreakdown(1625)).toEqual([
      { denom: 1000, count: 1 },
      { denom: 500, count: 1 },
      { denom: 100, count: 1 },
    ]);
  });

  it('only draws the biggest few piles and caps their height', () => {
    expect(chipBreakdown(1731)).toHaveLength(3);
    expect(chipBreakdown(9000)).toEqual([{ denom: 1000, count: 6 }]);
  });
});
