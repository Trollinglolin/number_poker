import type { Card, CardColor, NumberCard, OpCard, OpKind } from './types';

export const COLORS: CardColor[] = ['gold', 'silver', 'bronze', 'dark'];
/** tiebreak order, ascending (same as the original game) */
export const COLOR_RANK: Record<CardColor, number> = { dark: 0, bronze: 1, silver: 2, gold: 3 };

export const STARTING_CHIPS = 1000;
export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 2;

export const OP_SYMBOL: Record<OpKind, string> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  sqrt: '√',
};

export const OP_NAME: Record<OpKind, string> = {
  add: 'Add',
  subtract: 'Subtract',
  multiply: 'Multiply',
  divide: 'Divide',
  sqrt: 'Square root',
};

export const isNumber = (c: Card): c is NumberCard => c.kind === 'number';
export const isOp = (c: Card): c is OpCard => c.kind === 'op';
export const isBinary = (c: Card): c is OpCard & { op: Exclude<OpKind, 'sqrt'> } =>
  c.kind === 'op' && c.op !== 'sqrt';
export const isSqrt = (c: Card): c is OpCard & { op: 'sqrt' } => c.kind === 'op' && c.op === 'sqrt';

const opCard = (id: string, op: OpKind): OpCard => ({ id, kind: 'op', op });

/** every player starts each hand with these three */
export function baseOps(): OpCard[] {
  return [opCard('add', 'add'), opCard('subtract', 'subtract'), opCard('divide', 'divide')];
}

/** 44 number cards (0-10 in four colours), 4 multiply, 4 square root; shuffled */
export function createDeck(rng: () => number): Card[] {
  const deck: Card[] = [];
  for (const color of COLORS) {
    for (let value = 0; value <= 10; value++) {
      deck.push({ id: `n${value}${color[0]}`, kind: 'number', value, color });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push(opCard(`mul${i}`, 'multiply'));
    deck.push(opCard(`sqrt${i}`, 'sqrt'));
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export const numberCards = (cards: Card[]): NumberCard[] => cards.filter(isNumber);
