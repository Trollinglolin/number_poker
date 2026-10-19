export type CardColor = 'gold' | 'silver' | 'bronze' | 'dark';
export type OpKind = 'add' | 'subtract' | 'multiply' | 'divide' | 'sqrt';
export type BetType = 'small' | 'big' | 'both';

export interface NumberCard {
  id: string;
  kind: 'number';
  value: number;
  color: CardColor;
}

export interface OpCard {
  id: string;
  kind: 'op';
  op: OpKind;
}

export type Card = NumberCard | OpCard;

export type Phase =
  | 'waiting'
  | 'preflop'
  | 'dealing1'
  | 'betting1'
  | 'dealing2'
  | 'betting2'
  | 'equation'
  | 'ended';

export type FoldReason = 'fold' | 'forfeit' | 'timeout';

export interface Submission {
  betType: BetType;
  small?: { ids: string[]; expr: string; value: number };
  big?: { ids: string[]; expr: string; value: number };
}

export interface Seat {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  chips: number;
  /** chips put in during the current betting round */
  bet: number;
  /** chips put in during the whole hand */
  committed: number;
  folded: boolean;
  foldedBy?: FoldReason;
  allIn: boolean;
  eliminated: boolean;
  /** left mid-hand: folded now, removed when the next hand is dealt */
  left?: boolean;
  acted: boolean;
  /** number cards, plus any square root / multiply cards, in dealt order */
  cards: Card[];
  /** the starting operation cards still held (add, subtract, divide) */
  ops: OpCard[];
  /** the original game discarded a multiply card drawn straight after a square root */
  sqrtFlag: boolean;
  submission?: Submission;
}

export interface Spectator {
  id: string;
  name: string;
  connected: boolean;
}

export interface LogEntry {
  seq: number;
  text: string;
  playerId?: string;
}

export interface ShowdownPlayer {
  id: string;
  name: string;
  folded: boolean;
  foldedBy?: FoldReason;
  betType?: BetType;
  small?: { expr: string; value: number; diff: number };
  big?: { expr: string; value: number; diff: number };
  /** number cards, so everyone can see the tiebreak colours */
  cards: Card[];
  /** chips this player put in this hand */
  committed: number;
  payout: number;
}

export interface Showdown {
  kind: 'fold' | 'showdown' | 'refund';
  pot: number;
  payouts: Record<string, number>;
  winnerIds: string[];
  smallWinnerId?: string;
  bigWinnerId?: string;
  explanation: string[];
  players: ShowdownPlayer[];
}

export interface PendingSwap {
  playerId: string;
  card: OpCard;
}

export interface Room {
  code: string;
  hostId: string;
  phase: Phase;
  /** hands played so far in this match */
  hand: number;
  seats: Seat[];
  spectators: Spectator[];
  deck: Card[];
  pot: number;
  currentBet: number;
  turn: string | null;
  pendingSwap: PendingSwap | null;
  result: Showdown | null;
  matchWinnerId: string | null;
  log: LogEntry[];
  seq: number;
  rng: () => number;
}

export type Action =
  | { type: 'fold' }
  | { type: 'call' }
  | { type: 'raise'; amount: number }
  | { type: 'swap'; op: 'add' | 'subtract' }
  | { type: 'noSwap' }
  | { type: 'submit'; betType: BetType; small?: string[]; big?: string[] };

export class GameError extends Error {}
