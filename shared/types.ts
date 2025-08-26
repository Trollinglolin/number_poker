export type CardColor = 'gold' | 'silver' | 'bronze' | 'dark';
export type OperationType = 'add' | 'subtract' | 'multiply' | 'divide' | 'squareRoot';

export interface NumberCard {
  type: 'number';
  value: number;
  color: CardColor;
}

export interface OperationCard {
  type: 'operation';
  operation: OperationType;
}

export type Card = NumberCard | OperationCard;

export interface Player {
  id: string;
  name: string;
  chips: number;
  cards: Card[];
  operationCards: OperationCard[];
  bet: number;
  betType: 'small' | 'big' | 'both' | 'not selected';
  isActive: boolean;
  isFolded: boolean;
  submittedEquations?: { small?: string; big?: string };
  isSquareRoot: boolean;
  hasMultiply: boolean;
  isAllIn: boolean;
}

export interface GameState {
  id: string;
  players: Player[];
  deck: Card[];
  currentPlayer: string;
  pot: number;
  currentBet: number;
  phase: 'waiting' | 'preflop' | 'dealing1' | 'betting1' | 'dealing2' | 'betting2' | 'equation' | 'final' | 'ended';
  round: number;
  winners: {
    small: string[];
    big: string[];
  };
  lastAction?: {
    playerId: string;
    playerName: string;
    action: string;
    amount?: number;
  };
  equationResults?: Array<{
    playerId: string;
    playerName: string;
    betType: 'small' | 'big' | 'both';
    equations: { small?: { expr: string; result: number }; big?: { expr: string; result: number } };
  }>;
}

export type GameAction = {
  type: 'bet' | 'fold' | 'call' | 'raise' | 'selectBetType' | 'submitEquation' | 'continue' | 'swapCard' | 'noSwap';
  playerId: string;
  amount?: number;
  betType?: 'small' | 'big' | 'both' | 'not selected';
  equation?: string;
  equations?: { small?: string; big?: string };
  swapCardType?: OperationType;
};

export interface GameEvent {
  type: 'gameUpdate' | 'error';
  payload: GameState | { message: string };
} 