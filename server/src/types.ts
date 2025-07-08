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
  betType: 'small' | 'big' | 'both' | null;
  isActive: boolean;
  isFolded: boolean;
}

export interface GameState {
  id: string;
  players: Player[];
  deck: Card[];
  currentPlayer: string | null;
  pot: number;
  currentBet: number;
  phase: 'waiting' | 'betting1' | 'dealing1' | 'betting2' | 'dealing2' | 'betting3' | 'dealing3' | 'equation' | 'final' | 'ended';
  round: number;
  winners: {
    small: string[];
    big: string[];
  };
}

export interface GameAction {
  type: 'bet' | 'fold' | 'call' | 'raise' | 'selectBetType' | 'submitEquation';
  playerId: string;
  amount?: number;
  betType?: 'small' | 'big' | 'both';
  equation?: string;
} 