import { bettingLimits } from './engine';
import { MAX_PLAYERS, STARTING_CHIPS, isNumber } from './cards';
import type { Card, FoldReason, LogEntry, OpCard, Phase, PendingSwap, Room, Showdown } from './types';

/** A card as one viewer is allowed to see it. */
export type CardView = (Card & { secret?: boolean }) | { id: string; kind: 'hidden' };

export interface PlayerView {
  id: string;
  name: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  chips: number;
  bet: number;
  isDealer: boolean;
  isSmallBlind: boolean;
  isBigBlind: boolean;
  folded: boolean;
  foldedBy?: FoldReason;
  allIn: boolean;
  eliminated: boolean;
  /** has locked in an equation (contents stay private until the showdown) */
  submitted: boolean;
  cards: CardView[];
  ops: OpCard[];
}

export interface RoomView {
  code: string;
  you: string;
  isSpectator: boolean;
  hostId: string;
  phase: Phase;
  hand: number;
  pot: number;
  currentBet: number;
  turn: string | null;
  deckCount: number;
  pendingSwap: Omit<PendingSwap, 'card'> | null;
  players: PlayerView[];
  spectators: number;
  result: Showdown | null;
  matchWinnerId: string | null;
  log: LogEntry[];
  /** only filled in when it is your turn to bet */
  betting: { callAmount: number; minRaise: number; maxRaise: number } | null;
  /** the blinds for this hand */
  blinds: { small: number; big: number };
  limits: { maxPlayers: number; startingChips: number };
}

/**
 * Build what one viewer may see. The deck, other players' first number card and
 * everyone's equations stay hidden until the showdown reveals them.
 */
export function buildView(room: Room, viewerId: string): RoomView {
  const viewerSeat = room.seats.find((s) => s.id === viewerId);
  const reveal = room.result?.kind === 'showdown';

  const players: PlayerView[] = room.seats.map((s) => {
    const mine = s.id === viewerId;
    const firstNumberId = s.cards.find(isNumber)?.id;
    const cards: CardView[] = s.cards.map((c) => {
      if (mine) return c.id === firstNumberId ? { ...c, secret: true } : c;
      if (reveal && !s.folded) return c;
      return c.id === firstNumberId ? { id: `hidden-${s.id}`, kind: 'hidden' as const } : c;
    });
    return {
      id: s.id,
      name: s.name,
      isBot: s.isBot,
      isHost: s.id === room.hostId,
      connected: s.connected,
      chips: s.chips,
      bet: s.bet,
      isDealer: room.dealerId === s.id && room.phase !== 'waiting',
      isSmallBlind: room.smallBlindId === s.id && room.phase !== 'waiting',
      isBigBlind: room.bigBlindId === s.id && room.phase !== 'waiting',
      folded: s.folded,
      foldedBy: s.foldedBy,
      allIn: s.allIn,
      eliminated: s.eliminated,
      submitted: Boolean(s.submission),
      cards,
      ops: s.ops,
    };
  });

  const isBettingTurn =
    viewerSeat && room.turn === viewerId && (room.phase === 'preflop' || room.phase === 'betting1' || room.phase === 'betting2');

  return {
    code: room.code,
    you: viewerId,
    isSpectator: !viewerSeat,
    hostId: room.hostId,
    phase: room.phase,
    hand: room.hand,
    pot: room.pot,
    currentBet: room.currentBet,
    turn: room.turn,
    deckCount: room.deck.length,
    pendingSwap: room.pendingSwap ? { playerId: room.pendingSwap.playerId } : null,
    players,
    spectators: room.spectators.length,
    result: room.result,
    matchWinnerId: room.matchWinnerId,
    log: room.log.slice(-30),
    betting: isBettingTurn ? bettingLimits(room, viewerSeat!) : null,
    blinds: room.blinds,
    limits: { maxPlayers: MAX_PLAYERS, startingChips: STARTING_CHIPS },
  };
}
