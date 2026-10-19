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
import type { Action, Card, Room } from '../src/types';
import { mulberry32 } from './helpers';

const id = (s: string) => s;
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

describe('betting rounds', () => {
  it('walks through all three betting rounds to the equation phase', () => {
    const room = table(3);
    startHand(room);
    expect(room.phase).toBe('preflop');
    expect(room.turn).toBe('p0');
    numbersOnly(room);
    for (const p of ['p0', 'p1', 'p2']) act(room, p, { type: 'call' });
    expect(room.phase).toBe('betting1');
    for (const p of ['p0', 'p1', 'p2']) act(room, p, { type: 'call' });
    expect(room.phase).toBe('betting2');
    for (const p of ['p0', 'p1', 'p2']) expect(numberCards(seat(room, p).cards)).toHaveLength(4);
    for (const p of ['p0', 'p1', 'p2']) act(room, p, { type: 'call' });
    expect(room.phase).toBe('equation');
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
    act(room, 'p0', { type: 'raise', amount: 50 });
    expect(room.currentBet).toBe(50);
    expect(room.pot).toBe(50);
    act(room, 'p1', { type: 'call' });
    expect(room.phase).toBe('preflop');
    act(room, 'p2', { type: 'raise', amount: 20 });
    expect(room.currentBet).toBe(70);
    act(room, 'p0', { type: 'call' });
    act(room, 'p1', { type: 'call' });
    expect(room.phase).toBe('betting1');
    expect(room.pot).toBe(210);
    expect(seat(room, 'p0').chips).toBe(930);
  });

  it('caps a raise so every player can still call', () => {
    const room = table(3);
    startHand(room);
    numbersOnly(room);
    seat(room, 'p2').chips = 100;
    expect(bettingLimits(room, seat(room, 'p0')).maxRaise).toBe(100);
    expect(() => act(room, 'p0', { type: 'raise', amount: 101 })).toThrow(/most you can raise/);
    act(room, 'p0', { type: 'raise', amount: 100 });
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
    expect(seat(room, 'p0').chips).toBe(1000);
    expect(totalChips(room)).toBe(total);
  });

  it('skips betting when only one player can still act', () => {
    const room = table(2);
    startHand(room);
    numbersOnly(room);
    act(room, 'p0', { type: 'raise', amount: 1000 });
    act(room, 'p1', { type: 'call' });
    // both all-in: no more betting, straight through dealing to the equation phase
    expect(room.phase).toBe('equation');
    expect(room.pot).toBe(2000);
  });
});

describe('dealing and the multiply card', () => {
  it('pauses for a swap, then resumes dealing', () => {
    const room = table(2);
    startHand(room);
    stack(room, ['mul0', 'n3g', 'n5s', 'n4g', 'n6s']);
    act(room, 'p0', { type: 'call' });
    act(room, 'p1', { type: 'call' });
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
    act(room, 'p0', { type: 'call' });
    act(room, 'p1', { type: 'call' });
    act(room, 'p0', { type: 'noSwap' });
    expect(seat(room, 'p0').ops).toHaveLength(3);
    expect(seat(room, 'p0').cards.some((c) => c.id === 'mul0')).toBe(false);
  });

  it('only add or subtract can be swapped', () => {
    const room = table(2);
    startHand(room);
    stack(room, ['mul0', 'n3g', 'n5s', 'n4g', 'n6s']);
    act(room, 'p0', { type: 'call' });
    act(room, 'p1', { type: 'call' });
    expect(() => act(room, 'p0', { type: 'swap', op: 'divide' as 'add' })).toThrow();
    expect(() => act(room, 'p1', { type: 'noSwap' })).toThrow(/no swap waiting/i);
  });

  it('a square root card is extra: the player still gets all their number cards', () => {
    const room = table(2);
    startHand(room);
    stack(room, ['sqrt0', 'n3g', 'n5s', 'n4g', 'n6s']);
    act(room, 'p0', { type: 'call' });
    act(room, 'p1', { type: 'call' });
    const a = seat(room, 'p0');
    expect(a.cards.map((c) => c.id)).toEqual(['sqrt0', 'n3g', 'n5s']);
    expect(numberCards(a.cards)).toHaveLength(2);
  });

  it('a multiply drawn straight after a square root is discarded (original behaviour)', () => {
    const room = table(2);
    startHand(room);
    stack(room, ['sqrt0', 'mul0', 'n3g', 'n5s', 'n4g', 'n6s']);
    act(room, 'p0', { type: 'call' });
    act(room, 'p1', { type: 'call' });
    expect(room.pendingSwap).toBeNull();
    expect(room.phase).toBe('betting1');
    expect(seat(room, 'p0').cards.map((c) => c.id)).toEqual(['sqrt0', 'n3g', 'n5s']);
  });

  it('a second multiply, drawn after the first was kept, is skipped without a prompt', () => {
    const room = table(2);
    startHand(room);
    stack(room, ['mul0', 'n3g', 'mul1', 'n5s', 'n4g', 'n6s']);
    act(room, 'p0', { type: 'call' });
    act(room, 'p1', { type: 'call' });
    act(room, 'p0', { type: 'swap', op: 'add' });
    expect(room.pendingSwap).toBeNull();
    expect(room.phase).toBe('betting1');
    expect(seat(room, 'p0').cards.map((c) => c.id)).toEqual(['mul0', 'n3g', 'n5s']);
  });
});

describe('equation phase and showdown', () => {
  function toEquation(room: Room, order: string[]) {
    startHand(room);
    stack(room, order);
    for (let round = 0; round < 3; round++) {
      for (const s of room.seats) if (room.turn === s.id) act(room, s.id, { type: 'call' });
      for (const s of room.seats) if (room.turn === s.id) act(room, s.id, { type: 'call' });
    }
  }

  it('settles a showdown with real equations and conserves chips', () => {
    const room = table(2);
    const total = totalChips(room);
    startHand(room);
    stack(room, ['n3g', 'n5s', 'n4g', 'n6s', 'n2b', 'n9d', 'n7b', 'n1d']);
    act(room, 'p0', { type: 'call' });
    act(room, 'p1', { type: 'call' });
    act(room, 'p0', { type: 'raise', amount: 100 });
    act(room, 'p1', { type: 'call' });
    act(room, 'p0', { type: 'call' });
    act(room, 'p1', { type: 'call' });
    expect(room.phase).toBe('equation');
    expect(room.pot).toBe(200);

    // p0 hand: 3 5 2 9 -> 9 + 5 - 2 / 3 = 13.33   p1 hand: 4 6 7 1 -> 7 + 6 - 1 / 4 = 12.75
    act(room, 'p0', { type: 'submit', betType: 'big', big: ['n9d', 'add', 'n5s', 'subtract', 'n2b', 'divide', 'n3g'] });
    expect(room.phase).toBe('equation');
    act(room, 'p1', { type: 'submit', betType: 'big', big: ['n7b', 'add', 'n6s', 'subtract', 'n1d', 'divide', 'n4g'] });
    expect(room.phase).toBe('ended');
    expect(room.result?.kind).toBe('showdown');
    expect(room.result?.payouts).toEqual({ p0: 200 });
    expect(seat(room, 'p0').chips).toBe(1100);
    expect(seat(room, 'p1').chips).toBe(900);
    expect(totalChips(room)).toBe(total);
    expect(room.result!.explanation.join(' ')).toMatch(/closest to 20/);
  });

  it('rejects an equation that does not use every card, or breaks the rules', () => {
    const room = table(2);
    startHand(room);
    stack(room, ['n3g', 'n5s', 'n4g', 'n6s', 'n2b', 'n9d', 'n7b', 'n1d']);
    for (let i = 0; i < 6; i++) for (const s of room.seats) if (room.turn === s.id) act(room, s.id, { type: 'call' });
    expect(room.phase).toBe('equation');
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
    act(room, 'p0', { type: 'raise', amount: 10 });
    act(room, 'p1', { type: 'call' });
    for (let i = 0; i < 4; i++) for (const s of room.seats) if (room.turn === s.id) act(room, s.id, { type: 'call' });
    expect(room.phase).toBe('ended');
    expect(room.result?.kind).toBe('fold');
    expect(seat(room, 'p0').foldedBy).toBe('forfeit');
    expect(seat(room, 'p1').chips).toBe(1010);
  });

  it('forceAct folds a player who is holding up a betting turn, a swap or an equation', () => {
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
    for (let i = 0; i < 6; i++) for (const s of room.seats) if (room.turn === s.id) act(room, s.id, { type: 'call' });
    act(room, 'p0', { type: 'submit', betType: 'big', big: ['n9d', 'add', 'n5s', 'subtract', 'n2b', 'divide', 'n3g'] });
    const mid = JSON.stringify(buildView(room, 'p1'));
    expect(mid).not.toContain('expr');
    expect(mid).not.toContain('"big"');
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
    for (const p of ['p0', 'p1', 'p2']) act(room, p, { type: 'call' });
    for (const p of ['p0', 'p1', 'p2']) act(room, p, { type: 'call' });
    expect(room.phase).toBe('betting2');
    act(room, 'p0', { type: 'call' });
    act(room, 'p1', { type: 'call' });
    act(room, 'p2', { type: 'fold' });
    expect(room.phase).toBe('equation');
    act(room, 'p0', { type: 'submit', betType: 'big', big: ['n9d', 'add', 'n5s', 'subtract', 'n2b', 'divide', 'n3g'] });
    act(room, 'p1', { type: 'submit', betType: 'big', big: ['n7b', 'add', 'n6s', 'subtract', 'n1d', 'divide', 'n4g'] });
    expect(room.result?.kind).toBe('showdown');
    for (const viewer of ['p0', 'p1', 'p2']) {
      const json = JSON.stringify(buildView(room, viewer));
      if (viewer !== 'p2') {
        // p2's first-dealt card; their other cards were public all hand
        expect(json, `viewer ${viewer}`).not.toContain('n8b');
      }
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
  });
});

describe('match flow', () => {
  it('ends the match when one player has all the chips, and can reset', () => {
    const room = table(2);
    startHand(room);
    act(room, 'p0', { type: 'raise', amount: 1000 });
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

describe('fuzz: whole matches never stall and never lose chips', () => {
  function pickAction(room: Room, rng: () => number): { who: string; action: Action } | null {
    if (room.pendingSwap) {
      const a = botAction(room, room.pendingSwap.playerId);
      return a ? { who: room.pendingSwap.playerId, action: a } : null;
    }
    if (room.phase === 'preflop' || room.phase === 'betting1' || room.phase === 'betting2') {
      const who = room.turn!;
      const { maxRaise } = bettingLimits(room, room.seats.find((s) => s.id === who)!);
      const r = rng();
      if (r < 0.15) return { who, action: { type: 'fold' } };
      if (r < 0.4 && maxRaise >= 1) {
        const amount = rng() < 0.2 ? maxRaise : 1 + Math.floor(rng() * Math.min(maxRaise, 120));
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
    let forfeits = 0;
    for (let m = 0; m < 300; m++) {
      const n = 2 + Math.floor(rng() * 7);
      const room = table(n, 1000 + m);
      const total = totalChips(room);
      let guard = 0;
      while (!room.matchWinnerId && guard++ < 40) {
        startHand(room);
        hands++;
        let steps = 0;
        while (room.phase !== 'ended') {
          expect(steps++, `stalled in ${room.phase}`).toBeLessThan(400);
          const pick = pickAction(room, rng);
          expect(pick, `nobody can act in ${room.phase} (turn ${room.turn})`).not.toBeNull();
          if (rng() < 0.01 && isBlocking(room, pick!.who)) forceAct(room, pick!.who);
          else act(room, pick!.who, pick!.action);
          expect(totalChips(room)).toBe(total);
          for (const s of room.seats) expect(s.chips).toBeGreaterThanOrEqual(0);
        }
        forfeits += room.seats.filter((s) => s.foldedBy === 'forfeit').length;
        expect(room.pot).toBe(0);
        expect(totalChips(room)).toBe(total);
      }
    }
    expect(hands).toBeGreaterThan(1000);
    void forfeits;
    void id;
    void isNumber;
  });
});
