/* eslint-disable */
// @ts-nocheck
/**
 * ORACLE: the original game's rule code, copied verbatim from the 2023 version
 * (client/src/components/EquationBuilder.tsx and server/src/services/gameService.ts).
 * Only the surrounding class/React plumbing was removed. The rewrite is tested against
 * this file, so do not "clean it up".
 */

/* ---- EquationBuilder.tsx: calculateEquationResult (slots: {card|null}[]) ---- */
export const calculateEquationResult = (slots) => {
  // First, convert slots to tokens with proper grouping for square root
  const tokens = [];
  let i = 0;

  while (i < slots.length) {
    const slot = slots[i];
    if (!slot.card) {
      i++;
      continue;
    }

    if (slot.card.type === 'number') {
      tokens.push({ type: 'number', value: slot.card.value.toString() });
    } else if (slot.card.operation === 'squareRoot') {
      // Look ahead for the next number
      const nextSlot = slots[i + 1];
      if (nextSlot?.card?.type === 'number') {
        tokens.push({
          type: 'sqrt',
          value: `Math.sqrt(${nextSlot.card.value})`,
        });
        i++; // Skip the next number since we've included it in the sqrt
      } else {
        return null; // Invalid: square root without a number
      }
    } else {
      tokens.push({
        type: 'operator',
        value:
          slot.card.operation === 'multiply'
            ? '*'
            : slot.card.operation === 'divide'
              ? '/'
              : slot.card.operation === 'add'
                ? '+'
                : slot.card.operation === 'subtract'
                  ? '-'
                  : '',
      });
    }
    i++;
  }

  if (tokens.length === 0) return null;

  try {
    // Build the equation string with proper grouping
    let equation = '';
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type === 'sqrt') {
        // For square root, we already have the proper grouping
        equation += token.value;
      } else {
        equation += token.value;
      }
    }

    // Use Function constructor to safely evaluate the equation
    // The equation will now be evaluated with proper PEMDAS
    const result = new Function(`return ${equation}`)();
    return isFinite(result) ? result : null;
  } catch (error) {
    return null;
  }
};

/* ---- EquationBuilder.tsx: buildEquation (the string that is sent to the server) ---- */
export const buildEquation = (slots) => {
  // Filter out null cards first
  const nonNullSlots = slots.filter((slot) => slot.card !== null);

  // Check for empty slots
  if (nonNullSlots.length === 0) return null;

  // Check for operator at start or end
  const firstCard = nonNullSlots[0].card;
  const lastCard = nonNullSlots[nonNullSlots.length - 1].card;

  if (firstCard.type !== 'number' || lastCard.type !== 'number') {
    return null;
  }

  // Check for consecutive invalid card combinations
  for (let i = 0; i < nonNullSlots.length - 1; i++) {
    const current = nonNullSlots[i].card;
    const next = nonNullSlots[i + 1].card;

    // Check for two consecutive number cards
    if (current.type === 'number' && next.type === 'number') {
      return null;
    }

    // Check for consecutive operators (with square root exception)
    if (current.type === 'operation' && next.type === 'operation') {
      // Allow square root after certain operators
      const allowedBeforeSqrt = ['add', 'subtract', 'multiply', 'divide'];
      if (!(next.operation === 'squareRoot' && allowedBeforeSqrt.includes(current.operation))) {
        return null;
      }
    }
  }

  const equation = nonNullSlots
    .map((slot) => {
      if (!slot.card) return '';
      if (slot.card.type === 'number') return slot.card.value.toString();
      return slot.card.operation === 'multiply'
        ? '*'
        : slot.card.operation === 'divide'
          ? '/'
          : slot.card.operation === 'add'
            ? '+'
            : slot.card.operation === 'subtract'
              ? '-'
              : slot.card.operation === 'squareRoot'
                ? 'Math.sqrt'
                : '';
    })
    .join('');

  return equation || null;
};

/* ---- gameService.ts: resolveEquationsAndDistributePot (verbatim body) ---- */
export function resolveEquationsAndDistributePot(game) {
  // Helper to safely evaluate a math expression string (using same logic as EquationBuilder)
  function safeEval(expr) {
    try {
      // Convert equation to tokens with proper grouping for square root
      const tokens = [];
      const parts = expr.split(/(sqrt|[\+\-\*\/\(\)])/).filter((p) => p.trim());

      let i = 0;
      while (i < parts.length) {
        const part = parts[i].trim();
        if (!part) {
          i++;
          continue;
        }

        if (/^\d+$/.test(part)) {
          tokens.push({ type: 'number', value: part });
        } else if (part === 'sqrt') {
          // Look ahead for the next number or expression in parentheses
          const nextPart = parts[i + 1]?.trim();
          if (nextPart?.startsWith('(')) {
            tokens.push({ type: 'sqrt', value: `Math.sqrt${nextPart}` });
            i++; // Skip the next part since we've included it
          } else if (nextPart && /^\d+$/.test(nextPart)) {
            tokens.push({ type: 'sqrt', value: `Math.sqrt(${nextPart})` });
            i++; // Skip the next number
          } else {
            return null; // Invalid square root
          }
        } else if (['+', '-', '*', '/'].includes(part)) {
          tokens.push({
            type: 'operator',
            value: part === '*' ? '*' : part === '/' ? '/' : part === '+' ? '+' : part === '-' ? '-' : '',
          });
        }
        i++;
      }

      if (tokens.length === 0) return null;

      // Build the equation string with proper grouping
      let equation = '';
      for (const token of tokens) {
        equation += token.value;
      }

      // Use Function constructor to safely evaluate
      const result = new Function(`return ${equation}`)();
      return isFinite(result) ? result : null;
    } catch {
      return null;
    }
  }

  // Store all equations and their results for display
  const equationResults = [];

  // Collect results
  const results = [];
  for (const player of game.players) {
    if (player.isFolded || !player.betType) continue;

    const entry = { player };
    const eqResults = {};

    if (player.betType === 'small' || player.betType === 'both') {
      const expr = player.submittedEquations?.small;
      if (expr) {
        const val = safeEval(expr);
        if (val !== null) {
          entry.small = val;
          eqResults.small = { expr, result: val };
        }
      }
    }
    if (player.betType === 'big' || player.betType === 'both') {
      const expr = player.submittedEquations?.big;
      if (expr) {
        const val = safeEval(expr);
        if (val !== null) {
          entry.big = val;
          eqResults.big = { expr, result: val };
        }
      }
    }
    if (player.betType === 'not selected') {
      throw new Error('Player ' + player.name + ' did not select a bet type');
    }

    results.push(entry);
    equationResults.push({
      playerId: player.id,
      playerName: player.name,
      betType: player.betType,
      equations: eqResults,
    });
  }
  // Card color values (ascending order)
  const colorValues = {
    dark: 0,
    bronze: 1,
    silver: 2,
    gold: 3,
  };

  // Find winners with tiebreaker logic
  let smallWinners = [];
  let bigWinners = [];
  let minSmallDiff = Infinity;
  let minBigDiff = Infinity;

  // Check if all players bet the same type
  const allSmall = results.every((r) => r.player.betType === 'small');
  const allBig = results.every((r) => r.player.betType === 'big');

  // First pass: find closest to target
  for (const r of results) {
    if (typeof r.small === 'number') {
      const diff = Math.abs(r.small - 1);
      if (diff < minSmallDiff) {
        minSmallDiff = diff;
        smallWinners = [r.player];
      } else if (diff === minSmallDiff) {
        smallWinners.push(r.player);
      }
    }
    if (typeof r.big === 'number') {
      const diff = Math.abs(r.big - 20);
      if (diff < minBigDiff) {
        minBigDiff = diff;
        bigWinners = [r.player];
      } else if (diff === minBigDiff) {
        bigWinners.push(r.player);
      }
    }
  }

  const getSmallestCardValue = (player) => {
    const numberCards = player.cards.filter((c) => c.type === 'number');
    if (numberCards.length === 0) return Infinity; // or handle this case
    return Math.min(...numberCards.map((c) => c.value * 10 + colorValues[c.color]));
  };

  // For small bet: find the player with smallest card's color (ascending order)
  const smallWinner =
    smallWinners.length > 0
      ? smallWinners.reduce((winner, current) =>
          getSmallestCardValue(current) < getSmallestCardValue(winner) ? current : winner,
        )
      : null;

  const getBiggestCardValue = (player) => {
    const numberCards = player.cards.filter((c) => c.type === 'number');
    if (numberCards.length === 0) return -Infinity; // or handle this case
    return Math.max(...numberCards.map((c) => c.value * 10 + colorValues[c.color]));
  };

  // For big bet
  const bigWinner =
    bigWinners.length > 0
      ? bigWinners.reduce((winner, current) =>
          getBiggestCardValue(current) > getBiggestCardValue(winner) ? current : winner,
        )
      : null;

  // Store equation results in game state for client display
  game.equationResults = equationResults;

  // Check for "bet both" players who lost either small or big
  const bothBetPlayers = results.filter((r) => r.player.betType === 'both');
  const bothBetLosers = [];

  for (const bothPlayer of bothBetPlayers) {
    const lostSmall = typeof bothPlayer.small === 'number' && smallWinner && smallWinner.id !== bothPlayer.player.id;
    const lostBig = typeof bothPlayer.big === 'number' && bigWinner && bigWinner.id !== bothPlayer.player.id;

    // If player bet both but lost either small or big, they lose completely
    if (lostSmall || lostBig) {
      bothBetLosers.push(bothPlayer.player);
    }
  }

  // Distribute pot with new "bet both" rule
  if (allSmall && smallWinner) {
    // All players bet small - single winner takes full pot
    smallWinner.chips += game.pot;
    game.winners.small = [smallWinner.id];
  } else if (allBig && bigWinner) {
    // All players bet big - single winner takes full pot
    bigWinner.chips += game.pot;
    game.winners.big = [bigWinner.id];
  } else if (smallWinner && bigWinner && smallWinner.id === bigWinner.id) {
    // One player wins both
    smallWinner.chips += game.pot;
    game.winners.small = [smallWinner.id];
    game.winners.big = [bigWinner.id];
  } else {
    // Handle mixed betting scenarios with new "bet both" rule
    const hasBothBetLosers = bothBetLosers.length > 0;

    if (hasBothBetLosers) {
      // If there are "bet both" losers, the other winners take the entire pot
      if (smallWinner && !bothBetLosers.some((p) => p.id === smallWinner.id)) {
        smallWinner.chips += game.pot;
        game.winners.small = [smallWinner.id];
      } else if (bigWinner && !bothBetLosers.some((p) => p.id === bigWinner.id)) {
        bigWinner.chips += game.pot;
        game.winners.big = [bigWinner.id];
      }
    } else {
      // No "bet both" losers, split pot as before (tiebreakers already applied)
      if (smallWinner) {
        smallWinner.chips += Math.floor(game.pot / 2);
        game.winners.small = [smallWinner.id];
      }
      if (bigWinner) {
        bigWinner.chips += Math.ceil(game.pot / 2);
        game.winners.big = [bigWinner.id];
      }
    }
  }

  // Clear pot
  game.pot = 0;
}

/** the server's safeEval, exposed on its own for the evaluator comparison */
export function safeEval(expr) {
  const game = {
    pot: 0,
    winners: { small: [], big: [] },
    players: [
      {
        id: 'x',
        name: 'x',
        isFolded: false,
        betType: 'small',
        chips: 0,
        cards: [],
        submittedEquations: { small: expr },
      },
    ],
  };
  resolveEquationsAndDistributePot(game);
  return game.equationResults[0].equations.small?.result ?? null;
}
