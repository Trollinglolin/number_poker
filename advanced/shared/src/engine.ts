import {
  BIG_BLIND,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SMALL_BLIND,
  STARTING_CHIPS,
  baseOps,
  createDeck,
  isNumber,
  isOp,
  numberCards,
} from './cards';
import { hasValidEquation, validateEquation } from './equation';
import { settle } from './settle';
import type { Contender } from './settle';
import {
  GameError,
  type Action,
  type BetType,
  type Phase,
  type Room,
  type Seat,
  type Showdown,
  type ShowdownPlayer,
} from './types';

export { GameError };

const BETTING: Phase[] = ['preflop', 'betting1', 'betting2'];

/* ------------------------------------------------------------------ helpers */

const inHand = (room: Room) => room.seats.filter((s) => !s.eliminated && !s.folded);
const canAct = (s: Seat) => !s.eliminated && !s.folded && !s.allIn;
const seatOf = (room: Room, id: string) => room.seats.find((s) => s.id === id);
const nameOf = (room: Room, id: string) => seatOf(room, id)?.name ?? 'Someone';

function log(room: Room, text: string, playerId?: string) {
  room.seq += 1;
  room.log.push({ seq: room.seq, text, playerId });
  if (room.log.length > 60) room.log.splice(0, room.log.length - 60);
}

function newSeat(id: string, name: string, isBot: boolean): Seat {
  return {
    id,
    name,
    isBot,
    connected: true,
    chips: STARTING_CHIPS,
    bet: 0,
    committed: 0,
    folded: false,
    allIn: false,
    eliminated: false,
    acted: false,
    cards: [],
    ops: baseOps(),
    sqrtFlag: false,
  };
}

/* --------------------------------------------------------------- room setup */

export function createRoom(code: string, host: { id: string; name: string }, rng: () => number = Math.random): Room {
  const room: Room = {
    code,
    hostId: host.id,
    phase: 'waiting',
    dealerId: null,
    smallBlindId: null,
    bigBlindId: null,
    blinds: { small: SMALL_BLIND, big: BIG_BLIND },
    hand: 0,
    seats: [],
    spectators: [],
    deck: [],
    pot: 0,
    currentBet: 0,
    turn: null,
    pendingSwap: null,
    result: null,
    matchWinnerId: null,
    log: [],
    seq: 0,
    rng,
  };
  room.seats.push(newSeat(host.id, host.name, false));
  log(room, `${host.name} opened the table.`, host.id);
  return room;
}

export function addPlayer(room: Room, id: string, name: string, isBot = false): Seat {
  if (room.phase !== 'waiting') throw new GameError('The game has already started.');
  if (room.seats.length >= MAX_PLAYERS) throw new GameError('This table is full.');
  const seat = newSeat(id, name, isBot);
  room.seats.push(seat);
  log(room, `${name} joined the table.`, id);
  return seat;
}

export function addSpectator(room: Room, id: string, name: string) {
  room.spectators.push({ id, name, connected: true });
  log(room, `${name} is watching.`, id);
}

/** waiting room: remove the seat. In a hand: fold them out so the table can continue. */
export function removePlayer(room: Room, id: string) {
  const seat = seatOf(room, id);
  if (!seat) {
    room.spectators = room.spectators.filter((s) => s.id !== id);
    return;
  }
  if (room.phase === 'waiting' || room.phase === 'ended') {
    if (room.dealerId === id) {
      // the button steps back one seat, so the next hand's dealer is the seat that followed the leaver
      const i = room.seats.findIndex((s) => s.id === id);
      room.dealerId = room.seats.length > 1 ? room.seats[(i - 1 + room.seats.length) % room.seats.length].id : null;
    }
    room.seats = room.seats.filter((s) => s.id !== id);
    log(room, `${seat.name} left the table.`, id);
    reassignHost(room);
    return;
  }
  seat.left = true;
  seat.connected = false;
  log(room, `${seat.name} left the table.`, id);
  forceAct(room, id, 'timeout');
}

function reassignHost(room: Room) {
  if (room.seats.some((s) => s.id === room.hostId && !s.left)) return;
  const next = room.seats.find((s) => !s.isBot && s.connected) ?? room.seats.find((s) => !s.isBot);
  if (next) room.hostId = next.id;
}

export function resetMatch(room: Room) {
  if (room.phase !== 'waiting' && room.phase !== 'ended') throw new GameError('Finish the current hand first.');
  room.seats = room.seats.filter((s) => !s.left);
  reassignHost(room);
  // everyone is getting fresh chips anyway, so spectators can take any free seats
  while (room.spectators.length > 0 && room.seats.length < MAX_PLAYERS) {
    const spec = room.spectators.shift()!;
    const seat = newSeat(spec.id, spec.name, false);
    seat.connected = spec.connected;
    room.seats.push(seat);
    log(room, `${spec.name} took a seat.`, spec.id);
  }
  for (const s of room.seats) {
    s.chips = STARTING_CHIPS;
    s.eliminated = false;
    s.cards = [];
    s.ops = baseOps();
    s.bet = 0;
    s.committed = 0;
    s.folded = false;
    s.foldedBy = undefined;
    s.allIn = false;
    s.submission = undefined;
  }
  room.phase = 'waiting';
  room.hand = 0;
  room.pot = 0;
  room.currentBet = 0;
  room.dealerId = null;
  room.smallBlindId = null;
  room.bigBlindId = null;
  room.blinds = { small: SMALL_BLIND, big: BIG_BLIND };
  room.turn = null;
  room.pendingSwap = null;
  room.result = null;
  room.matchWinnerId = null;
  log(room, 'Chips reset. A fresh match is ready.');
}

/* --------------------------------------------------------------- hand flow */

export function startHand(room: Room) {
  if (room.phase !== 'waiting' && room.phase !== 'ended') throw new GameError('A hand is already in progress.');
  if (room.matchWinnerId) throw new GameError('The match is over. Reset chips to play again.');
  // remember the seating order before anyone is removed, so the button can move on from a seat that is gone
  const seatOrder = room.seats.map((s) => s.id);
  room.seats = room.seats.filter((s) => !s.left);
  reassignHost(room);
  for (const s of room.seats) if (s.chips <= 0) s.eliminated = true;
  // someone who is disconnected when the hand starts sits it out instead of stalling the table
  const present = (s: Seat) => !s.eliminated && (s.isBot || s.connected);
  const playing = room.seats.filter(present);
  if (playing.length < MIN_PLAYERS) {
    throw new GameError('At least two players with chips are needed.');
  }

  // the dealer button moves to the next seated player after its old position
  const playingIds = new Set(playing.map((s) => s.id));
  const from = room.dealerId ? seatOrder.indexOf(room.dealerId) : -1;
  let dealer = playing[0];
  if (from !== -1) {
    for (let i = 1; i <= seatOrder.length; i++) {
      const id = seatOrder[(from + i) % seatOrder.length];
      if (playingIds.has(id)) {
        dealer = playing.find((s) => s.id === id)!;
        break;
      }
    }
  }
  const d = playing.indexOf(dealer);
  // heads-up the dealer posts the small blind; otherwise the two seats after the button post
  const headsUp = playing.length === 2;
  const sbSeat = headsUp ? dealer : playing[(d + 1) % playing.length];
  const bbSeat = headsUp ? playing[(d + 1) % 2] : playing[(d + 2) % playing.length];

  // blinds shrink to the shortest stack so everyone can post in full and no side pot is ever needed
  const shortest = Math.min(...playing.map((s) => s.chips));
  const big = Math.min(BIG_BLIND, shortest);
  const small = Math.min(SMALL_BLIND, Math.floor(big / 2));

  room.deck = createDeck(room.rng);
  room.hand += 1;
  room.pot = 0;
  room.currentBet = 0;
  room.turn = null;
  room.pendingSwap = null;
  room.result = null;
  room.dealerId = dealer.id;
  room.smallBlindId = sbSeat.id;
  room.bigBlindId = bbSeat.id;
  room.blinds = { small, big };
  for (const s of room.seats) {
    s.cards = [];
    s.ops = baseOps();
    s.bet = 0;
    s.committed = 0;
    s.folded = !present(s);
    s.foldedBy = s.folded && !s.eliminated ? 'timeout' : undefined;
    s.allIn = false;
    s.acted = false;
    s.sqrtFlag = false;
    s.submission = undefined;
  }
  room.phase = 'preflop';
  log(room, `Hand ${room.hand}: ${dealer.name} has the button.`, dealer.id);

  // post the blinds. Posting does not count as acting, so the big blind keeps the option to raise.
  if (small > 0) {
    pay(room, sbSeat, small);
    log(room, `${sbSeat.name} posted the small blind of ${small}.`, sbSeat.id);
  }
  pay(room, bbSeat, big);
  room.currentBet = big;
  log(room, `${bbSeat.name} posted the big blind of ${big}.`, bbSeat.id);

  if (!roundNeedsAction(room)) {
    advanceAfterBetting(room);
    return;
  }
  room.turn = nextActorAfter(room, bbSeat.id)!.id;
}

/** first seat after `afterId` (clockwise) that can still act */
function nextActorAfter(room: Room, afterId: string | null): Seat | undefined {
  const n = room.seats.length;
  const start = afterId ? room.seats.findIndex((s) => s.id === afterId) : -1;
  for (let i = 1; i <= n; i++) {
    const s = room.seats[(start + i + n) % n];
    if (canAct(s)) return s;
  }
  return undefined;
}

/** nobody to bet against, or the one player left who can act already has the bet covered */
function roundNeedsAction(room: Room): boolean {
  const actors = room.seats.filter(canAct);
  if (actors.length === 0) return false;
  if (actors.length === 1) return actors[0].bet < room.currentBet;
  return true;
}

/** the second and third betting rounds: bets reset and the player after the button acts first */
function beginBetting(room: Room) {
  room.currentBet = 0;
  for (const s of room.seats) {
    s.bet = 0;
    s.acted = false;
  }
  if (!roundNeedsAction(room)) {
    advanceAfterBetting(room);
    return;
  }
  room.turn = nextActorAfter(room, room.dealerId)!.id;
}

function advanceAfterBetting(room: Room) {
  room.turn = null;
  if (room.phase === 'preflop') {
    room.phase = 'dealing1';
    log(room, 'Dealing two number cards each.');
    continueDealing(room);
  } else if (room.phase === 'betting1') {
    room.phase = 'dealing2';
    log(room, 'Dealing two more number cards each.');
    continueDealing(room);
  } else if (room.phase === 'betting2') {
    startEquation(room);
  }
}

/** Deal until everyone has the target count of number cards. Pauses for a multiply decision. */
function continueDealing(room: Room) {
  const target = room.phase === 'dealing1' ? 2 : 4;
  for (const seat of inHand(room)) {
    while (numberCards(seat.cards).length < target) {
      const card = room.deck.pop();
      if (!card) throw new GameError('The deck ran out.');
      if (isNumber(card)) {
        seat.cards.push(card);
        seat.sqrtFlag = false;
      } else if (card.op === 'sqrt') {
        // a square root card is extra: the player simply draws again
        seat.cards.push(card);
        seat.sqrtFlag = true;
      } else if (card.op === 'multiply') {
        const holdsMultiply = seat.cards.some((c) => isOp(c) && c.op === 'multiply');
        // a second multiply, or one drawn straight after a square root, is discarded (original behaviour)
        if (holdsMultiply || seat.sqrtFlag) continue;
        if (seat.ops.length === 0) {
          seat.cards.push(card);
          seat.sqrtFlag = false;
          continue;
        }
        room.pendingSwap = { playerId: seat.id, card };
        room.turn = seat.id;
        log(room, `${seat.name} drew a multiply card.`, seat.id);
        return;
      }
    }
  }
  // dealing finished
  if (room.phase === 'dealing1') {
    room.phase = 'betting1';
    log(room, 'Second betting round.');
  } else {
    room.phase = 'betting2';
    log(room, 'Final betting round.');
  }
  beginBetting(room);
}

function resolveSwap(room: Room, seat: Seat, op: 'add' | 'subtract' | null) {
  const pending = room.pendingSwap;
  if (!pending || pending.playerId !== seat.id) throw new GameError('There is no swap waiting for you.');
  if (op) {
    // the original UI only ever offered add and subtract for the trade
    if (op !== 'add' && op !== 'subtract') throw new GameError('Only add or subtract can be swapped.');
    const idx = seat.ops.findIndex((c) => c.op === op);
    if (idx === -1) throw new GameError('You no longer hold that card.');
    seat.ops.splice(idx, 1);
    seat.cards.push(pending.card);
    seat.sqrtFlag = false;
    log(room, `${seat.name} swapped ${op === 'add' ? 'add' : 'subtract'} for multiply.`, seat.id);
  } else {
    log(room, `${seat.name} kept their cards and discarded the multiply.`, seat.id);
  }
  room.pendingSwap = null;
  room.turn = null;
  continueDealing(room);
}

/* ----------------------------------------------------------------- betting */

export interface BettingLimits {
  callAmount: number;
  /** the smallest legal raise: the big blind, or everything that can be raised if that is less */
  minRaise: number;
  maxRaise: number;
}

export function bettingLimits(room: Room, seat: Seat): BettingLimits {
  const callAmount = Math.max(0, room.currentBet - seat.bet);
  const cap = Math.min(...inHand(room).map((s) => s.chips + s.bet));
  const maxRaise = Math.max(0, cap - room.currentBet);
  return { callAmount, minRaise: Math.min(room.blinds.big, maxRaise), maxRaise };
}

function pay(room: Room, seat: Seat, amount: number) {
  seat.chips -= amount;
  seat.bet += amount;
  seat.committed += amount;
  room.pot += amount;
  if (seat.chips === 0) seat.allIn = true;
}

function afterBettingAction(room: Room, seat: Seat) {
  const actors = room.seats.filter(canAct);
  const settled = actors.every((s) => s.acted && s.bet === room.currentBet);
  if (settled) {
    advanceAfterBetting(room);
    return;
  }
  const start = room.seats.findIndex((s) => s.id === seat.id);
  for (let i = 1; i <= room.seats.length; i++) {
    const next = room.seats[(start + i) % room.seats.length];
    if (canAct(next) && (!next.acted || next.bet < room.currentBet)) {
      room.turn = next.id;
      return;
    }
  }
  advanceAfterBetting(room);
}

function doFold(room: Room, seat: Seat, reason: 'fold' | 'forfeit' | 'timeout') {
  seat.folded = true;
  seat.foldedBy = reason;
  if (reason === 'fold') log(room, `${seat.name} folded.`, seat.id);
  else if (reason === 'forfeit') log(room, `${seat.name} cannot build an equation and forfeits.`, seat.id);
  else log(room, `${seat.name} timed out and was folded.`, seat.id);

  const left = inHand(room);
  if (left.length <= 1) {
    finishByFold(room, left[0]);
    return;
  }
  if (BETTING.includes(room.phase) && room.turn === seat.id) afterBettingAction(room, seat);
  else if (room.phase === 'equation') maybeShowdown(room);
}

function finishByFold(room: Room, winner: Seat | undefined) {
  const players: ShowdownPlayer[] = room.seats
    .filter((s) => !s.eliminated)
    .map((s) => ({
      id: s.id,
      name: s.name,
      folded: s.folded,
      foldedBy: s.foldedBy,
      cards: [],
      committed: s.committed,
      payout: 0,
    }));
  const payouts: Record<string, number> = {};
  let kind: Showdown['kind'] = 'fold';
  const explanation: string[] = [];

  if (winner) {
    winner.chips += room.pot;
    payouts[winner.id] = room.pot;
    players.find((p) => p.id === winner.id)!.payout = room.pot;
    explanation.push(
      room.pot === 0
        ? 'Everyone else folded, but nobody had bet, so no chips change hands.'
        : `Everyone else folded, so ${winner.name} takes the pot of ${room.pot}.`,
    );
  } else {
    // nobody left (everyone forfeited): give each player back what they put in
    kind = 'refund';
    for (const s of room.seats) {
      if (s.committed > 0) {
        s.chips += s.committed;
        payouts[s.id] = s.committed;
        const p = players.find((x) => x.id === s.id);
        if (p) p.payout = s.committed;
      }
    }
    explanation.push('Nobody could build an equation, so every bet is returned.');
  }
  room.result = {
    kind,
    pot: room.pot,
    payouts,
    winnerIds: winner ? [winner.id] : [],
    explanation,
    players,
  };
  endHand(room);
}

function endHand(room: Room) {
  room.pot = 0;
  room.turn = null;
  room.pendingSwap = null;
  room.phase = 'ended';
  const alive = room.seats.filter((s) => s.chips > 0);
  room.matchWinnerId = alive.length <= 1 ? (alive[0]?.id ?? null) : null;
  if (room.matchWinnerId) log(room, `${nameOf(room, room.matchWinnerId)} has all the chips and wins the match.`);
}

/* ---------------------------------------------------------------- equations */

function startEquation(room: Room) {
  room.phase = 'equation';
  room.turn = null;
  log(room, 'Build your equations.');
  // a hand with no valid equation (e.g. four square roots) cannot be played: forfeit
  for (const seat of inHand(room)) {
    if (!hasValidEquation(seat.cards.concat(seat.ops))) {
      seat.folded = true;
      seat.foldedBy = 'forfeit';
      log(room, `${seat.name} cannot build an equation and forfeits.`, seat.id);
    }
  }
  const left = inHand(room);
  if (left.length <= 1) finishByFold(room, left[0]);
}

function submit(room: Room, seat: Seat, a: Extract<Action, { type: 'submit' }>) {
  if (room.phase !== 'equation') throw new GameError('It is not time to submit equations.');
  if (seat.eliminated || seat.folded) throw new GameError('You are not in this hand.');
  if (seat.submission) throw new GameError('You already locked in your equation.');
  const hand = seat.cards.concat(seat.ops);
  const wantSmall = a.betType === 'small' || a.betType === 'both';
  const wantBig = a.betType === 'big' || a.betType === 'both';
  if (wantSmall !== Boolean(a.small) || wantBig !== Boolean(a.big)) {
    throw new GameError('Provide an equation for each pool you bet on, and no others.');
  }
  const submission: Seat['submission'] = { betType: a.betType };
  if (a.small) {
    const v = validateEquation(hand, a.small);
    if (!v.ok) throw new GameError(`Small equation: ${v.reason}`);
    submission.small = { ids: a.small, expr: v.expr, value: v.value };
  }
  if (a.big) {
    const v = validateEquation(hand, a.big);
    if (!v.ok) throw new GameError(`Big equation: ${v.reason}`);
    submission.big = { ids: a.big, expr: v.expr, value: v.value };
  }
  seat.submission = submission;
  log(room, `${seat.name} locked in an equation.`, seat.id);
  maybeShowdown(room);
}

function maybeShowdown(room: Room) {
  if (room.phase !== 'equation') return;
  const left = inHand(room);
  if (left.length === 0 || !left.every((s) => s.submission)) return;
  resolveShowdown(room);
}

function resolveShowdown(room: Room) {
  const contenders: Contender[] = inHand(room).map((s) => ({
    id: s.id,
    betType: s.submission!.betType,
    cards: s.cards,
    small: s.submission!.small?.value,
    big: s.submission!.big?.value,
  }));
  const pot = room.pot;
  const s = settle(contenders, pot);

  for (const [id, amount] of Object.entries(s.payouts)) seatOf(room, id)!.chips += amount;

  const explanation = explain(room, s);
  const players: ShowdownPlayer[] = room.seats
    .filter((x) => !x.eliminated)
    .map((x) => ({
      id: x.id,
      name: x.name,
      folded: x.folded,
      foldedBy: x.foldedBy,
      betType: x.submission?.betType,
      small: x.submission?.small && {
        expr: x.submission.small.expr,
        value: x.submission.small.value,
        diff: Math.abs(x.submission.small.value - 1),
      },
      big: x.submission?.big && {
        expr: x.submission.big.expr,
        value: x.submission.big.value,
        diff: Math.abs(x.submission.big.value - 20),
      },
      // someone who folded never shows their cards, so their hidden card stays hidden
      cards: x.folded ? [] : x.cards.filter(isNumber),
      committed: x.committed,
      payout: s.payouts[x.id] ?? 0,
    }));

  room.result = {
    kind: 'showdown',
    pot,
    payouts: s.payouts,
    winnerIds: Object.keys(s.payouts).filter((id) => s.payouts[id] > 0),
    smallWinnerId: s.smallWinnerId,
    bigWinnerId: s.bigWinnerId,
    explanation,
    players,
  };
  log(room, 'Showdown.');
  endHand(room);
}

function explain(room: Room, s: ReturnType<typeof settle>): string[] {
  const n = (id?: string) => (id ? nameOf(room, id) : 'nobody');
  const out: string[] = [];
  const pot = room.pot;
  if (pot === 0) {
    // the original has no ante, so a hand where everyone only checks has nothing to win
    return ['Nobody put chips in the pot, so no chips change hands.'];
  }
  switch (s.branch) {
    case 'all-small':
      out.push(`Everyone bet small. ${n(s.smallWinnerId)} is closest to 1 and takes the whole pot of ${pot}.`);
      break;
    case 'all-big':
      out.push(`Everyone bet big. ${n(s.bigWinnerId)} is closest to 20 and takes the whole pot of ${pot}.`);
      break;
    case 'both-sweep':
      out.push(`${n(s.smallWinnerId)} bet both and won both pools, so takes the whole pot of ${pot}.`);
      break;
    case 'both-lost': {
      const losers = s.bothLoserIds.map(n).join(', ');
      const winnerId = Object.keys(s.payouts)[0];
      out.push(`${losers} bet both without winning both pools, so that bet loses.`);
      out.push(`${n(winnerId)} takes the whole pot of ${pot}.`);
      break;
    }
    case 'split-fallback':
      out.push(`${s.bothLoserIds.map(n).join(' and ')} each won one pool but bet both, so neither sweeps.`);
      out.push(`The pot of ${pot} is split between the small and big winners.`);
      break;
    case 'split':
      out.push(
        `${n(s.smallWinnerId)} wins small (closest to 1) and ${n(s.bigWinnerId)} wins big (closest to 20). The pot of ${pot} is split.`,
      );
      break;
  }
  if (s.smallTie.length > 1) {
    out.push(
      `Small tie between ${s.smallTie.map(n).join(' and ')}: the lowest number card wins, and for equal numbers the colour order is dark, bronze, silver, gold.`,
    );
  }
  if (s.bigTie.length > 1) {
    out.push(
      `Big tie between ${s.bigTie.map(n).join(' and ')}: the highest number card wins, and for equal numbers the colour order is gold, silver, bronze, dark.`,
    );
  }
  return out;
}

/* ------------------------------------------------------------------ actions */

export function act(room: Room, playerId: string, action: Action) {
  const seat = seatOf(room, playerId);
  if (!seat || seat.eliminated) throw new GameError('You are not seated in this hand.');

  switch (action.type) {
    case 'swap':
      resolveSwap(room, seat, action.op);
      return;
    case 'noSwap':
      resolveSwap(room, seat, null);
      return;
    case 'submit':
      submit(room, seat, action);
      return;
  }

  if (!BETTING.includes(room.phase)) throw new GameError('Betting is closed right now.');
  if (room.turn !== seat.id) throw new GameError('It is not your turn.');

  const { callAmount, minRaise, maxRaise } = bettingLimits(room, seat);
  switch (action.type) {
    case 'fold':
      doFold(room, seat, 'fold');
      return;
    case 'call':
      pay(room, seat, callAmount);
      seat.acted = true;
      log(room, callAmount === 0 ? `${seat.name} checked.` : `${seat.name} called ${callAmount}.`, seat.id);
      afterBettingAction(room, seat);
      return;
    case 'raise': {
      const amount = action.amount;
      if (!Number.isInteger(amount) || amount < 1) throw new GameError('Raise by a whole number of chips.');
      if (amount > maxRaise) throw new GameError(`The most you can raise is ${maxRaise}.`);
      if (amount < minRaise) throw new GameError(`The smallest raise is ${minRaise}, the big blind.`);
      pay(room, seat, callAmount + amount);
      room.currentBet += amount;
      for (const s of room.seats) if (s.id !== seat.id) s.acted = false;
      seat.acted = true;
      log(room, `${seat.name} raised by ${amount}.`, seat.id);
      afterBettingAction(room, seat);
      return;
    }
  }
}

/** Used when a player is away or blocking: fold, decline a swap, or forfeit the equation. */
export function forceAct(room: Room, playerId: string, reason: 'timeout' = 'timeout') {
  const seat = seatOf(room, playerId);
  if (!seat || seat.eliminated || seat.folded) return;
  if (room.pendingSwap?.playerId === playerId) {
    resolveSwap(room, seat, null);
    return;
  }
  if (BETTING.includes(room.phase) && room.turn === playerId) {
    doFold(room, seat, reason);
    return;
  }
  if (room.phase === 'equation' && !seat.submission) {
    doFold(room, seat, reason);
    return;
  }
  // mid-hand but not blocking right now (e.g. they left): fold them out
  if (room.phase !== 'waiting' && room.phase !== 'ended') doFold(room, seat, reason);
}

/** Is this player the one the table is waiting on? */
export function isBlocking(room: Room, playerId: string): boolean {
  if (room.pendingSwap?.playerId === playerId) return true;
  if (BETTING.includes(room.phase) && room.turn === playerId) return true;
  const seat = seatOf(room, playerId);
  return room.phase === 'equation' && !!seat && !seat.eliminated && !seat.folded && !seat.submission;
}

export type { BetType };
