import { bestArrangement } from './equation';
import { bettingLimits } from './engine';
import type { Action, Room } from './types';

/**
 * Practice opponent. Like the original bot it always calls, but it picks its swap by
 * chance and builds its equations with the arrangement solver, so they always validate.
 */
export function botAction(room: Room, botId: string): Action | null {
  const seat = room.seats.find((s) => s.id === botId);
  if (!seat || seat.eliminated || seat.folded) return null;

  if (room.pendingSwap?.playerId === botId) {
    if (room.rng() < 0.5) return { type: 'noSwap' };
    return { type: 'swap', op: room.rng() < 0.5 ? 'add' : 'subtract' };
  }

  if ((room.phase === 'preflop' || room.phase === 'betting1' || room.phase === 'betting2') && room.turn === botId) {
    const { callAmount } = bettingLimits(room, seat);
    return callAmount > seat.chips ? { type: 'fold' } : { type: 'call' };
  }

  if (room.phase === 'equation' && !seat.submission) {
    const hand = seat.cards.concat(seat.ops);
    const small = bestArrangement(hand, 1);
    const big = bestArrangement(hand, 20);
    if (!small || !big) return null;
    const smallDiff = Math.abs(small.value - 1);
    const bigDiff = Math.abs(big.value - 20);
    const ids = (o: { ordered: { id: string }[] }) => o.ordered.map((c) => c.id);
    if (smallDiff <= 0.25 && bigDiff <= 0.25) {
      return { type: 'submit', betType: 'both', small: ids(small), big: ids(big) };
    }
    return smallDiff <= bigDiff
      ? { type: 'submit', betType: 'small', small: ids(small) }
      : { type: 'submit', betType: 'big', big: ids(big) };
  }
  return null;
}
