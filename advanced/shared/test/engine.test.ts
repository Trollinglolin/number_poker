import { describe, expect, it } from 'vitest';
import {
  act,
  addPlayer,
  addSpectator,
  bettingLimits,
  createRoom,
  forceAct,
  isBlocking,
  removePlayer,
  resetMatch,
  startHand,
} from '../src/engine';
import { botAction } from '../src/bot';
import { buildView } from '../src/views';
import { createDeck, isNumber, numberCards } from '../src/cards';
import type { Action, Card, Phase, Room } from '../src/types';
import { mulberry32 } from './helpers';

const deckById = new Map(createDeck(Math.random).map((c) => [c.id, c]));
const C = (...ids: string[]): Card[] => ids.map((i) => deckById.get(i)!);

/** put these cards on top of the deck, dealt in this order */
function stack(room: Room, order: string[]) {
  const used = new Set(order);
  const rest = room.deck.filter((c) => !used.has(c.id));
  room.deck = [...rest, ...C(...order).reverse()];
}

function table(n: number, seed = 1): Room {
  const room = createRoom('TEST', { id: 'p0', name: 'Ada' }, mulberry32(seed));
  const names = ['Ada', 'Bo', 'Cy', 'Di', 'Ed', 'Flo', 'Gus', 'Hal'];
  for (let i = 1; i < n; i++) addPlayer(room, `p${i}`, names[i]);
  return room;
}

/** keep random multiply / square root cards out of tests that are not about them */
const numbersOnly = (room: Room) => {
  room.deck = room.deck.filter(isNumber);
};

/** everyone who holds the turn calls (or checks) until the hand reaches `phase` */
function callUntil(room: Room, phase: Phase) {
  let guard = 0;
  while (room.phase !== phase) {
    if (guard++ > 100) throw new Error(`stuck in ${room.phase}`);
    if (room.pendingSwap) act(room, room.pendingSwap.playerId, { type: 'noSwap' });
    else act(room, room.turn!, { type: 'call' });
  }
}

/** whoever holds the turn folds until the hand ends */
function foldToTheEnd(room: Room) {
  let guard = 0;
  while (room.phase !== 'ended') {
    if (guard++ > 50) throw new Error('stuck');
    act(room, room.turn!, { type: 'fold' });
  }
}

/** drive a hand to the end: bots decide swaps and equations, everyone else calls */
function autoFinish(room: Room) {
  let guard = 0;
  while (room.phase !== 'ended') {
    if (guard++ > 200) throw new Error('stalled');
    const who = room.pendingSwap?.playerId ?? room.turn ?? room.seats.find((s) => !s.eliminated && !s.folded && !s.submission)!.id;
    const a: Action | null = room.phase === 'equation' || room.pendingSwap ? botAction(room, who) : { type: 'call' };
    act(room, who, a!);
  }
}

const totalChips = (room: Room) => room.seats.reduce((a, s) => a + s.chips, 0) + room.pot;
const seat = (room: Room, who: string) => room.seats.find((s) => s.id === who)!;

describe('blinds and the button', () => {
  it('three players: the button, then small and big blind, and the player after the big blind acts first', () => {
    const room = table(3);
    startHand(room);
    expect([room.dealerId, room.smallBlindId, room.bigBlindId]).toEqual(['p0', 'p1', 'p2']);
    expect(room.blinds).toEqual({ small: 5, big: 10 });
    expect(seat(room, 'p1')).toMatchObject({ chips: 995, bet: 5 });
    expect(seat(room, 'p2')).toMatchObject({ chips: 990, bet: 10 });
    expect(room.pot).toBe(15);
    expect(room.currentBet).toBe(10);
    expect(room.turn).toBe('p0');
    const view = buildView(room, 'p0');
    expect(view.players.map((p) => [p.isDealer, p.isSmallBlind, p.isBigBlind])).toEqual([
      [true, false, false],
      [false, true, false],
      [false, false, true],
    ]);
    expect(view.betting).toMatchObject({ callAmount: 10, minRaise: 10 });
  });

  it('heads-up: the dealer posts the small blind and acts first before the flop, the big blind acts first after', () => {
    const room = table(2);
    startHand(room);
    numbersOnly(room);
    expect([room.dealerId, room.smallBlindId, room.bigBlindId]).toEqual(['p0', 'p0', 'p1']);
    expect(room.turn).toBe('p0');
    expect(bettingLimits(room, seat(room, 'p0')).callAmount).toBe(5);
    act(room, 'p0', { type: 'call' });
    // the big blind still has the option to act
    expect(room.phase).toBe('preflop');
    expect(room.turn).toBe('p1');
    act(room, 'p1', { type: 'call' });
    expect(room.phase).toBe('betting1');
    expect(room.turn).toBe('p1');
    expect(room.pot).toBe(20);
  });

  it('the big blind keeps the option to raise after everyone limps', () => {
    const room = table(3);
    startHand(room);
    numbersOnly(room);
    act(room, 'p0', { type: 'call' });
    act(room, 'p1', { type: 'call' });
    expect(room.phase).toBe('preflop');
    expect(room.turn).toBe('p2');
    act(room, 'p2', { type: 'raise', amount: 20 });
    expect(room.currentBet).toBe(30);
    expect(room.turn).toBe('p0');
    act(room, 'p0', { type: 'call' });
    act(room, 'p1', { type: 'call' });
    expect(room.phase).toBe('betting1');
    expect(room.pot).toBe(90);
  });

  it('everyone folding to the big blind wins the small blind', () => {
    const room = table(3);
    startHand(room);
    const total = totalChips(room);
    act(room, 'p0', { type: 'fold' });
    act(room, 'p1', { type: 'fold' });
    expect(room.phase).toBe('ended');
    expect(seat(room, 'p2').chips).toBe(1005);
    expect(seat(room, 'p1').chips).toBe(995);
    expect(seat(room, 'p0').chips).toBe(1000);
    expect(totalChips(room)).toBe(total);
  });

  it('the button moves one seat every hand', () => {
    const room = table(3);
    const dealers: (string | null)[] = [];
    for (let h = 0; h < 4; h++) {
      startHand(room);
      dealers.push(room.dealerId);
      foldToTheEnd(room);
    }
    expect(dealers).toEqual(['p0', 'p1', 'p2', 'p0']);
  });

  it('the button skips a busted player and moves on from a player who left', () => {
    const room = table(4);
    startHand(room); // dealer p0
    foldToTheEnd(room);
    seat(room, 'p1').chips = 0; // busted
    startHand(room);
    expect(room.dealerId).toBe('p2');
    foldToTheEnd(room);

    const room2 = table(4);
    startHand(room2);
    foldToTheEnd(room2);
    startHand(room2); // dealer p1
    expect(room2.dealerId).toBe('p1');
    foldToTheEnd(room2);
    removePlayer(room2, 'p1');
    startHand(room2);
    expect(room2.dealerId).toBe('p2'); // the next seat after where p1 was
  });

  it('shrinks the blinds to the shortest stack so nobody needs a side pot', () => {
    const room = table(3);
    seat(room, 'p2').chips = 7;
    startHand(room);
    expect(room.blinds).toEqual({ small: 3, big: 7 });
    expect(seat(room, 'p1').bet).toBe(3);
    expect(seat(room, 'p2')).toMatchObject({ bet: 7, chips: 0, allIn: true });
    expect(room.currentBet).toBe(7);
  });

  it('the smallest raise is the big blind, or everything that can be raised if that is less', () => {
    const room = table(3);
    startHand(room);
    numbersOnly(room);
    expect(() => act(room, 'p0', { type: 'raise', amount: 5 })).toThrow(/smallest raise is 10/);
    act(room, 'p0', { type: 'raise', amount: 10 });
    expect(room.currentBet).toBe(20);

    const short = table(3);
    seat(short, 'p2').chips = 12; // after posting the big blind they have 2 left
    startHand(short);
    numbersOnly(short);
    expect(bettingLimits(short, seat(short, 'p0'))).toMatchObject({ minRaise: 2, maxRaise: 2 });
    expect(() => act(short, 'p0', { type: 'raise', amount: 1 })).toThrow(/smallest raise is 2/);
    act(short, 'p0', { type: 'raise', amount: 2 });
  });
});

describe('betting rounds', () => {
  it('walks through all three betting rounds to the equation phase', () => {
    const room = table(3);
    startHand(room);
    expect(room.phase).toBe('preflop');
    numbersOnly(room);
    callUntil(room, 'betting1');
    for (const p of ['p0', 'p1', 'p2']) expect(numberCards(seat(room, p).cards)).toHaveLength(2);
    // after the flop the player after the button acts first
    expect(room.turn).toBe('p1');
    callUntil(room, 'betting2');
    for (const p of ['p0', 'p1', 'p2']) expect(numberCards(seat(room, p).cards)).toHaveLength(4);
    callUntil(room, 'equation');
  });

  it('rejects out-of-turn actions', () => {
    const room = table(2);
    startHand(room);
    expect(() => act(room, 'p1', { type: 'call' })).toThrow(/not your turn/i);
  });

  it('a raise reopens the action and a call closes the round', () => {
    const room = table(3);
    startHand(room);
    numbersOnly(room);
    act(room, 'p0', { type: 'raise', amount: 50 }); // calls 10 and raises by 50
    expect(room.currentBet).toBe(60);
    expect(room.pot).toBe(15 + 60);
    act(room, 'p1', { type: 'call' });
    act(room, 'p2', { type: 'raise', amount: 20 });
    expect(room.currentBet).toBe(80);
    expect(room.phase).toBe('preflop');
    act(room, 'p0', { type: 'call' });
    act(room, 'p1', { type: 'call' });
    expect(room.phase).toBe('betting1');
    expect(room.pot).toBe(240);
    expect(seat(room, 'p0').chips).toBe(920);
  });

  it('caps a raise so every player can still call', () => {
    const room = table(3);
    seat(room, 'p2').chips = 100;
    startHand(room);
    numbersOnly(room);
    // p2 posted the big blind of 10 and has 90 behind, so the bet can reach 100
    expect(bettingLimits(room, seat(room, 'p0')).maxRaise).toBe(90);
    expect(() => act(room, 'p0', { type: 'raise', amount: 91 })).toThrow(/most you can raise/);
    act(room, 'p0', { type: 'raise', amount: 90 });
    act(room, 'p1', { type: 'call' });
    act(room, 'p2', { type: 'call' });
    expect(seat(room, 'p2').allIn).toBe(true);
    expect(room.phase).toBe('betting1');
    // an all-in player cannot be raised, so no one else can raise either
    expect(bettingLimits(room, seat(room, room.turn!)).maxRaise).toBe(0);
  });

  it('the last player standing wins the pot when everyone else folds', () => {
    const room = table(3);
    startHand(room);
    const total = totalChips(room);
    act(room, 'p0', { type: 'raise', amount: 30 });
    act(room, 'p1', { type: 'fold' });
    act(room, 'p2', { type: 'fold' });
    expect(room.phase).toBe('ended');
    expect(room.result?.kind).toBe('fold');
    // p0 put in 40 and wins the 55 in the pot
    expect(seat(room, 'p0').chips).toBe(1015);
    expect(totalChips(room)).toBe(total);
  });

  it('skips betting when only one player can still act', () => {
    const room = table(2);
    startHand(room);
    numbersOnly(room);
    act(room, 'p0', { type: 'raise', amount: 990 });
    act(room, 'p1', { type: 'call' });
    // both all-in: no more betting, straight through dealing to the equation phase
    expect(room.phase).toBe('equation');
    expect(room.pot).toBe(2000);
  });
});

describe('dealing and the multiply card', () => {
  /** heads-up preflop: the dealer calls the small blind, the big blind checks */
  const dealHeadsUp = (room: Room) => {
    act(room, 'p0', { type: 'call' });
    act(room, 'p1', { type: 'call' });
  };

  it('pauses for a swap, then resumes dealing', () => {
    const room = table(2);
    startHand(room);
    stack(room, ['mul0', 'n3g', 'n5s', 'n4g', 'n6s']);
    dealHeadsUp(room);
    expect(room.phase).toBe('dealing1');
    expect(room.pendingSwap?.playerId).toBe('p0');
    expect(isBlocking(room, 'p0')).toBe(true);
    act(room, 'p0', { type: 'swap', op: 'add' });
    expect(room.phase).toBe('betting1');
    expect(seat(room, 'p0').ops.map((o) => o.op)).toEqual(['subtract', 'divide']);
    expect(seat(room, 'p0').cards.map((c) => c.id)).toEqual(['mul0', 'n3g', 'n5s']);
    expect(numberCards(seat(room, 'p1').cards).map((c) => c.id)).toEqual(['n4g', 'n6s']);
  });

  it('declining discards the multiply and keeps the starting cards', () => {
    const room = table(2);
    startHand(room);
    stack(room, ['mul0', 'n3g', 'n5s', 'n4g', 'n6s']);
    dealHeadsUp(room);
    act(room, 'p0', { type: 'noSwap' });
    expect(seat(room, 'p0').ops).toHaveLength(3);
    expect(seat(room, 'p0').cards.some((c) => c.id === 'mul0')).toBe(false);
  });

  it('only add or subtract can be swapped', () => {
    const room = table(2);
    startHand(room);
    stack(room, ['mul0', 'n3g', 'n5s', 'n4g', 'n6s']);
    dealHeadsUp(room);
    expect(() => act(room, 'p0', { type: 'swap', op: 'divide' as 'add' })).toThrow();
    expect(() => act(room, 'p1', { type: 'noSwap' })).toThrow(/no swap waiting/i);
  });

  it('a square root card is extra: the player still gets all their number cards', () => {
    const room = table(2);
    startHand(room);
    stack(room, ['sqrt0', 'n3g', 'n5s', 'n4g', 'n6s']);
    dealHeadsUp(room);
    const a = seat(room, 'p0');
    expect(a.cards.map((c) => c.id)).toEqual(['sqrt0', 'n3g', 'n5s']);
    expect(numberCards(a.cards)).toHaveLength(2);
  });

  it('a multiply drawn straight after a square root is discarded (original behaviour)', () => {
    const room = table(2);
    startHand(room);
    stack(room, ['sqrt0', 'mul0', 'n3g', 'n5s', 'n4g', 'n6s']);
    dealHeadsUp(room);
    expect(room.pendingSwap).toBeNull();
    expect(room.phase).toBe('betting1');
    expect(seat(room, 'p0').cards.map((c) => c.id)).toEqual(['sqrt0', 'n3g', 'n5s']);
  });

  it('a second multiply, drawn after the first was kept, is skipped without a prompt', () => {
    const room = table(2);
    startHand(room);
    stack(room, ['mul0', 'n3g', 'mul1', 'n5s', 'n4g', 'n6s']);
    dealHeadsUp(room);
    act(room, 'p0', { type: 'swap', op: 'add' });
    expect(room.pendingSwap).toBeNull();
    expect(room.phase).toBe('betting1');
    expect(seat(room, 'p0').cards.map((c) => c.id)).toEqual(['mul0', 'n3g', 'n5s']);
  });
});

describe('equation phase and showdown', () => {
  const HAND = ['n3g', 'n5s', 'n4g', 'n6s', 'n2b', 'n9d', 'n7b', 'n1d'];

  it('settles a showdown with real equations and conserves chips', () => {
    const room = table(2);
    const total = totalChips(room);
    startHand(room);
    stack(room, HAND);
    act(room, 'p0', { type: 'call' });
    act(room, 'p1', { type: 'call' });
    expect(room.phase).toBe('betting1');
    act(room, 'p1', { type: 'raise', amount: 100 });
    act(room, 'p0', { type: 'call' });
    callUntil(room, 'equation');
    expect(room.pot).toBe(220);

    // p0 hand: 3 5 2 9 -> 9 + 5 - 2 / 3 = 13.33   p1 hand: 4 6 7 1 -> 7 + 6 - 1 / 4 = 12.75
    act(room, 'p0', { type: 'submit', betType: 'big', big: ['n9d', 'add', 'n5s', 'subtract', 'n2b', 'divide', 'n3g'] });
    expect(room.phase).toBe('equation');
    act(room, 'p1', { type: 'submit', betType: 'big', big: ['n7b', 'add', 'n6s', 'subtract', 'n1d', 'divide', 'n4g'] });
    expect(room.phase).toBe('ended');
    expect(room.result?.kind).toBe('showdown');
    expect(room.result?.payouts).toEqual({ p0: 220 });
    expect(seat(room, 'p0').chips).toBe(1110);
    expect(seat(room, 'p1').chips).toBe(890);
    expect(totalChips(room)).toBe(total);
    expect(room.result!.explanation.join(' ')).toMatch(/closest to 20/);
  });

  it('rejects an equation that does not use every card, or breaks the rules', () => {
    const room = table(2);
    startHand(room);
    stack(room, HAND);
    callUntil(room, 'equation');
    const bad = (a: Action) => expect(() => act(room, 'p0', a)).toThrow();
    bad({ type: 'submit', betType: 'small', small: ['n3g', 'add', 'n5s'] });
    bad({ type: 'submit', betType: 'small', small: ['n3g', 'n5s', 'add', 'n2b', 'add', 'n9d', 'subtract'] });
    bad({ type: 'submit', betType: 'both', small: ['n3g', 'add', 'n5s', 'add', 'n2b', 'add', 'n9d'] });
    bad({ type: 'submit', betType: 'big', small: ['n3g', 'add', 'n5s', 'add', 'n2b', 'add', 'n9d'] });
    expect(() => act(room, 'p1', { type: 'call' })).toThrow();
  });

  it('forfeits a player whose hand cannot make any equation (four square roots)', () => {
    const room = table(2);
    startHand(room);
    stack(room, ['sqrt0', 'sqrt1', 'sqrt2', 'sqrt3', 'n3g', 'n5s', 'n4g', 'n6s', 'n2b', 'n9d', 'n7b', 'n1d']);
    act(room, 'p0', { type: 'raise', amount: 10 }); // calls 5, raises by 10: bet to match 20
    act(room, 'p1', { type: 'call' });
    callUntil(room, 'ended');
    expect(room.result?.kind).toBe('fold');
    expect(seat(room, 'p0').foldedBy).toBe('forfeit');
    // p1 put in 20 and wins the 40 pot
    expect(seat(room, 'p1').chips).toBe(1020);
  });

  it('forceAct folds a player who is holding up a betting turn', () => {
    const room = table(3);
    startHand(room);
    expect(isBlocking(room, 'p0')).toBe(true);
    forceAct(room, 'p0');
    expect(seat(room, 'p0').foldedBy).toBe('timeout');
    expect(room.turn).toBe('p1');
  });
});

describe('views hide what they must', () => {
  it('shows other players everything but their first number card, and never the deck', () => {
    const room = table(2);
    startHand(room);
    stack(room, ['n3g', 'n5s', 'n4g', 'n6s']);
    act(room, 'p0', { type: 'call' });
    act(room, 'p1', { type: 'call' });
    const forP1 = buildView(room, 'p1');
    const p0 = forP1.players.find((p) => p.id === 'p0')!;
    expect(p0.cards[0]).toEqual({ id: 'hidden-p0', kind: 'hidden' });
    expect(p0.cards[1]).toMatchObject({ id: 'n5s' });
    const mine = forP1.players.find((p) => p.id === 'p1')!;
    expect(mine.cards[0]).toMatchObject({ id: 'n4g', secret: true });
    expect(JSON.stringify(forP1)).not.toContain('"deck"');
    expect(forP1.deckCount).toBeGreaterThan(0);
    expect(buildView(room, 'someone-else').isSpectator).toBe(true);
  });

  it('keeps equations private until the showdown, then reveals everyone', () => {
    const room = table(2);
    startHand(room);
    stack(room, ['n3g', 'n5s', 'n4g', 'n6s', 'n2b', 'n9d', 'n7b', 'n1d']);
    callUntil(room, 'equation');
    act(room, 'p0', { type: 'submit', betType: 'big', big: ['n9d', 'add', 'n5s', 'subtract', 'n2b', 'divide', 'n3g'] });
    const mid = JSON.stringify(buildView(room, 'p1'));
    expect(mid).not.toContain('expr');
    expect(mid).not.toContain('"ids"');
    expect(buildView(room, 'p1').players.find((p) => p.id === 'p0')!.submitted).toBe(true);
    act(room, 'p1', { type: 'submit', betType: 'big', big: ['n7b', 'add', 'n6s', 'subtract', 'n1d', 'divide', 'n4g'] });
    const end = buildView(room, 'p1');
    expect(end.players.find((p) => p.id === 'p0')!.cards.some((c) => c.kind === 'hidden')).toBe(false);
    expect(end.result?.players.find((p) => p.id === 'p0')?.big?.value).toBeCloseTo(13.3333, 3);
  });
});

describe('folded players keep their cards secret at the showdown', () => {
  it('does not reveal a folded player hidden card to anyone', () => {
    const room = table(3);
    startHand(room);
    // p0: 3 5 2 9   p1: 4 6 7 1   p2 (folds on the last round): 8 10 0 1
    stack(room, ['n3g', 'n5s', 'n4g', 'n6s', 'n8b', 'n10d', 'n2b', 'n9d', 'n7b', 'n1d', 'n0g', 'n1s']);
    callUntil(room, 'betting2');
    while (room.phase === 'betting2') {
      act(room, room.turn!, room.turn === 'p2' ? { type: 'fold' } : { type: 'call' });
    }
    expect(room.phase).toBe('equation');
    act(room, 'p0', { type: 'submit', betType: 'big', big: ['n9d', 'add', 'n5s', 'subtract', 'n2b', 'divide', 'n3g'] });
    act(room, 'p1', { type: 'submit', betType: 'big', big: ['n7b', 'add', 'n6s', 'subtract', 'n1d', 'divide', 'n4g'] });
    expect(room.result?.kind).toBe('showdown');
    for (const viewer of ['p0', 'p1']) {
      // p2's first-dealt card; their other cards were public all hand
      expect(JSON.stringify(buildView(room, viewer)), `viewer ${viewer}`).not.toContain('n8b');
    }
    expect(room.result!.players.find((p) => p.id === 'p2')!.cards).toEqual([]);
    // the players who did show down are revealed
    expect(JSON.stringify(buildView(room, 'p1'))).toContain('n3g');
  });
});

describe('spectators and a reset', () => {
  it('lets spectators take a seat when the match is reset', () => {
    const room = table(2);
    addSpectator(room, 'watcher', 'Wes');
    startHand(room);
    act(room, 'p0', { type: 'fold' });
    expect(room.phase).toBe('ended');
    resetMatch(room);
    expect(room.seats.map((s) => s.id)).toEqual(['p0', 'p1', 'watcher']);
    expect(room.spectators).toHaveLength(0);
    expect(seat(room, 'watcher').chips).toBe(1000);
    expect(room.dealerId).toBeNull();
  });
});

describe('match flow', () => {
  it('ends the match when one player has all the chips, and can reset', () => {
    const room = table(2);
    startHand(room);
    act(room, 'p0', { type: 'raise', amount: 990 });
    act(room, 'p1', { type: 'call' });
    // all in: the rest of the hand is played by the bot logic (swap choices, solver-built equations)
    autoFinish(room);
    expect(room.phase).toBe('ended');
    if (room.matchWinnerId) {
      expect(() => startHand(room)).toThrow(/match is over/i);
      resetMatch(room);
      expect(room.phase).toBe('waiting');
      expect(room.seats.every((s) => s.chips === 1000)).toBe(true);
    } else {
      expect(room.seats.every((s) => s.chips === 1000)).toBe(true); // tied pot split
    }
  });

  it('a seat can leave the waiting room and the host passes on', () => {
    const room = table(3);
    removePlayer(room, 'p0');
    expect(room.seats.map((s) => s.id)).toEqual(['p1', 'p2']);
    expect(room.hostId).toBe('p1');
  });
});

describe('fuzz: whole matches never stall, never lose chips, never need a side pot', () => {
  const BETTING = ['preflop', 'betting1', 'betting2'];

  function pickAction(room: Room, rng: () => number): { who: string; action: Action } | null {
    if (room.pendingSwap) {
      const a = botAction(room, room.pendingSwap.playerId);
      return a ? { who: room.pendingSwap.playerId, action: a } : null;
    }
    if (BETTING.includes(room.phase)) {
      const who = room.turn!;
      const { minRaise, maxRaise } = bettingLimits(room, room.seats.find((s) => s.id === who)!);
      const r = rng();
      if (r < 0.15) return { who, action: { type: 'fold' } };
      if (r < 0.4 && maxRaise >= 1) {
        const top = Math.min(maxRaise, minRaise + 120);
        const amount = rng() < 0.2 ? maxRaise : minRaise + Math.floor(rng() * (top - minRaise + 1));
        return { who, action: { type: 'raise', amount } };
      }
      return { who, action: { type: 'call' } };
    }
    if (room.phase === 'equation') {
      for (const s of room.seats) {
        if (!s.eliminated && !s.folded && !s.submission) {
          const a = botAction(room, s.id);
          if (a) return { who: s.id, action: a };
        }
      }
    }
    return null;
  }

  it('plays 300 matches across 2 to 8 players', () => {
    const rng = mulberry32(555);
    let hands = 0;
    const dealers = new Set<string>();
    for (let m = 0; m < 300; m++) {
      const n = 2 + Math.floor(rng() * 7);
      const room = table(n, 1000 + m);
      const total = totalChips(room);
      let guard = 0;
      while (!room.matchWinnerId && guard++ < 60) {
        startHand(room);
        hands++;
        dealers.add(room.dealerId!);
        // the blinds are always posted in full, so every all-in bet already equals the bet to match
        expect(room.blinds.big).toBeGreaterThan(0);
        let steps = 0;
        while (room.phase !== 'ended') {
          expect(steps++, `stalled in ${room.phase}`).toBeLessThan(400);
          const pick = pickAction(room, rng);
          expect(pick, `nobody can act in ${room.phase} (turn ${room.turn})`).not.toBeNull();
          if (rng() < 0.01 && isBlocking(room, pick!.who)) forceAct(room, pick!.who);
          else act(room, pick!.who, pick!.action);
          expect(totalChips(room)).toBe(total);
          for (const s of room.seats) expect(s.chips).toBeGreaterThanOrEqual(0);
          if (BETTING.includes(room.phase)) {
            for (const s of room.seats) {
              if (!s.eliminated && !s.folded && s.allIn) expect(s.bet, `all-in bet in ${room.phase}`).toBe(room.currentBet);
            }
          }
        }
        expect(room.pot).toBe(0);
        expect(totalChips(room)).toBe(total);
      }
    }
    expect(hands).toBeGreaterThan(1000);
    expect(dealers.size).toBeGreaterThan(1);
  });
});
