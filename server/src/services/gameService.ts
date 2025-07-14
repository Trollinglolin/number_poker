import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { GameState, Player, GameAction, Card, OperationType } from '@shared/types';

export class GameService {
  private games: Map<string, GameState> = new Map();
  private io: Server | null = null;

  constructor() {
    this.games = new Map();
  }

  setSocketIO(io: Server) {
    this.io = io;
  }

  createGame(): GameState {
    const gameId = Math.floor(Math.random() * 10000).toString();
    const game: GameState = {
      id: gameId,
      players: [],
      deck: this.createDeck(),
      currentPlayer: '',  // Initialize with empty string
      pot: 0,
      currentBet: 0,
      phase: 'waiting',
      round: 1,
      winners: {
        small: [],
        big: []
      }
    };
    this.games.set(gameId, game);
    return game;
  }

  getGame(gameId: string): GameState | undefined {
    return this.games.get(gameId);
  }

  joinGame(gameId: string, playerName: string): string {
    const game = this.games.get(gameId);
    if (!game) {
      throw new Error('Game not found');
    }

    if (game.phase !== 'waiting') {
      throw new Error('Game has already started');
    }

    const playerId = uuidv4();
    const player: Player = {
      id: playerId,
      name: playerName,
      chips: 1000,
      cards: [],
      operationCards: [
        { type: 'operation', operation: 'add' },
        { type: 'operation', operation: 'subtract' },
        { type: 'operation', operation: 'divide' }
      ],
      bet: 0,
      betType: null,
      isActive: true,
      isFolded: false,
      isSquareRoot: false,
      hasMultiply: false
    };

    game.players.push(player);
    this.notifyGameUpdate(gameId);
    return playerId;
  }

  startGame(gameId: string): void {
    const game = this.games.get(gameId);
    if (!game) {
      throw new Error('Game not found');
    }

    // For single player testing, add a bot player if needed
    if (game.players.length === 1) {
      const botPlayer: Player = {
        id: 'bot-1',
        name: 'Bot Player',
        chips: game.players[0].chips, // Match human player's chips
        cards: [],
        operationCards: [
          { type: 'operation', operation: 'add' },
          { type: 'operation', operation: 'subtract' },
          { type: 'operation', operation: 'divide' }
        ],
        bet: 0,
        betType: null,
        isActive: true,
        isFolded: false,
        isSquareRoot: false,
        hasMultiply: false
      };
      game.players.push(botPlayer);
    }

    // Reset game state while preserving chips
    game.deck = this.createDeck();
    game.phase = 'dealing1'; // Start with dealing1 phase
    game.currentPlayer = game.players[0].id;
    game.currentBet = 0;
    game.pot = 0;
    game.winners = { small: [], big: [] };
    game.equationResults = undefined; // Clear equation results
    
    // Reset player state while preserving chips
    game.players.forEach(player => {
      const currentChips = player.chips; // Store current chips
      player.cards = [];
      player.operationCards = [
        { type: 'operation', operation: 'add' },
        { type: 'operation', operation: 'subtract' },
        { type: 'operation', operation: 'divide' }
      ];
      player.bet = 0;
      player.betType = null;
      player.isActive = true;
      player.isFolded = false;
      player.submittedEquations = undefined;
      player.hasMultiply = false;
      player.chips = currentChips; // Restore chips
    });

    this.dealInitialCards(game);
    this.notifyGameUpdate(game.id);
  }

  private async handleBotTurn(game: GameState): Promise<void> {
    console.log('Handling bot turn:', { 
      gameId: game.id, 
      phase: game.phase,
      currentPlayer: game.currentPlayer 
    });

    const bot = game.players.find(p => p.id === game.currentPlayer);
    if (!bot || !bot.id.startsWith('bot-')) {
      console.log('Not a bot turn, skipping');
      return;
    }

    // Add a small delay to make bot actions feel more natural
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      if (game.phase === 'equation') {
        // Bot's turn during equation phase
        if (!bot.betType) {
          // Randomly select bet type
          const betTypes: ('small' | 'big' | 'both')[] = ['small', 'big', 'both'];
          const randomBetType = betTypes[Math.floor(Math.random() * betTypes.length)];
          console.log('Bot selecting bet type:', randomBetType);
          
          // Select bet type
          this.handleBetType(game, bot, randomBetType);
          
          // Generate and submit equations based on bet type
          const equations: { small?: string; big?: string } = {};
          
          // Helper to generate a simple equation using all cards
          const generateEquation = (target: number): string => {
            const numberCards = bot.cards.filter(c => c.type === 'number');
            const operationCards = bot.operationCards;
            
            // For now, just create a simple equation by concatenating numbers and operations
            let equation = '';
            for (let i = 0; i < numberCards.length; i++) {
              equation += numberCards[i].value;
              if (i < operationCards.length) {
                equation += operationCards[i].operation === 'multiply' ? '*' : 
                           operationCards[i].operation === 'divide' ? '/' : 
                           operationCards[i].operation === 'add' ? '+' : '-';
              }
            }
            return equation;
          };

          if (randomBetType === 'small' || randomBetType === 'both') {
            equations.small = generateEquation(1);
          }
          if (randomBetType === 'big' || randomBetType === 'both') {
            equations.big = generateEquation(20);
          }

          // Submit equations
          console.log('Bot submitting equations:', equations);
          this.performAction(game.id, {
            type: 'submitEquation',
            playerId: bot.id,
            equations
          });
        }
      } else if (game.phase.startsWith('betting')) {
        // Existing betting phase logic
        const activePlayers = game.players.filter(p => !p.isFolded);
        const currentBet = game.currentBet;
        const botBet = bot.bet;
        const callAmount = currentBet - botBet;

        if (callAmount > bot.chips) {
          // Bot can't afford to call, must fold
          this.handleFold(game, bot);
        } else {
          // Bot will always call for now
          this.handleCall(game, bot);
        }
      }
    } catch (error) {
      console.error('Error in bot turn:', error);
    }
  }

  performAction(gameId: string, action: GameAction): void {
    const game = this.games.get(gameId);
    if (!game) {
      throw new Error('Game not found');
    }

    const player = game.players.find(p => p.id === action.playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    // Allow swapCard actions regardless of current player (for card swapping during dealing)
    if (player.id !== game.currentPlayer && game.phase !== 'equation' && action.type !== 'swapCard' && game.phase !== 'dealing1' && game.phase !== 'dealing2') {
      throw new Error('Not your turn');
    }

    console.log('Performing action:', { 
      gameId, 
      action, 
      currentPhase: game.phase,
      currentPlayer: game.currentPlayer,
      currentBet: game.currentBet
    });

    // Check if the action is allowed in the current phase
    const isBettingPhase = game.phase.startsWith('betting');
    const isEquationPhase = game.phase === 'equation';
    const isDealingPhase = game.phase === 'dealing1' || game.phase === 'dealing2' || game.players.some(p => p.hasMultiply);

    // Validate action type against current phase
    if (!isBettingPhase && (action.type === 'bet' || action.type === 'call' || action.type === 'fold' || action.type === 'continue')) {
      throw new Error(`Betting actions are only allowed during betting phases. Current phase: ${game.phase}`);
    }

    // Prevent betting actions during dealing phase
    if (isDealingPhase && (action.type === 'bet' || action.type === 'call' || action.type === 'fold' || action.type === 'continue')) {
      throw new Error(`Betting actions are not allowed during dealing phase. Please wait for all cards to be dealt.`);
    }

    if (!isEquationPhase && action.type === 'selectBetType') {
      throw new Error(`Bet type selection is only allowed during equation phase. Current phase: ${game.phase}`);
    }

    try {
      switch (action.type) {
        case 'continue':
          if (!isBettingPhase) {
            throw new Error('Continue action is only allowed during betting phases');
          }
          // Verify that all active players have matched the current bet
          const activePlayers = game.players.filter(p => !p.isFolded);
          const allBetsMatched = activePlayers.every(p => p.bet === game.currentBet);
          if (!allBetsMatched) {
            throw new Error('Cannot continue until all players have matched the current bet');
          }
          // Advance to next phase
          this.advanceGamePhase(game);
          break;
        case 'bet':
          if (!isBettingPhase) {
            throw new Error('Betting is only allowed during betting phases');
          }
          if (typeof action.amount !== 'number') {
            throw new Error('Bet amount is required');
          }
          this.handleBet(game, player, action.amount);
          break;
        case 'call':
          if (!isBettingPhase) {
            throw new Error('Calling is only allowed during betting phases');
          }
          this.handleCall(game, player);
          break;
        case 'fold':
          if (!isBettingPhase) {
            throw new Error('Folding is only allowed during betting phases');
          }
          this.handleFold(game, player);
          break;
        case 'selectBetType':
          if (!isEquationPhase) {
            throw new Error('Bet type selection is only allowed during equation phase');
          }
          if (!action.betType) {
            throw new Error('Bet type is required');
          }
          this.handleBetType(game, player, action.betType);
          break;
        case 'submitEquation':
          if (!isEquationPhase) {
            throw new Error('Equation submission is only allowed during equation phase');
          }
          if (!action.equations || (player.betType === 'both' && (!action.equations.small || !action.equations.big)) || (player.betType === 'small' && !action.equations.small) || (player.betType === 'big' && !action.equations.big)) {
            throw new Error('All required equations must be submitted');
          }
          player.submittedEquations = action.equations;
          // Check if all active (not folded) players have submitted all required equations
          const allSubmitted = game.players.every(p => {
            if (p.isFolded) return true;
            if (p.betType === 'both') return p.submittedEquations?.small && p.submittedEquations?.big;
            if (p.betType === 'small') return p.submittedEquations?.small;
            if (p.betType === 'big') return p.submittedEquations?.big;
            return false;
          });
          if (allSubmitted) {
            this.resolveEquationsAndDistributePot(game);
            this.advanceGamePhase(game);
          } else {
            // this.moveToNextPlayer(game);
            // this.notifyGameUpdate(game.id);
          }
          this.notifyGameUpdate(game.id);
          break;
        case 'swapCard':
          if (!action.swapCardType) {
            throw new Error('Swap card type is required');
          }
          this.handleSwap(game, player, action.swapCardType);
          break;
        case 'noSwap':
          console.log('Successfully no swapped:', {
            playerId: player.id,
            playerName: player.name,
          });
          // Reset multiply flag since player chose not to swap
          player.hasMultiply = false;
          // Continue with dealing and force phase check
          this.continueDealing(game);
          // Additional check if all players have required cards
          if (game.phase === 'dealing1' && 
              game.players.every(p => p.cards.filter(c => c.type === 'number').length >= 2)) {
            game.phase = 'betting1';
          } else if (game.phase === 'dealing2' && 
                     game.players.every(p => p.cards.filter(c => c.type === 'number').length >= 4)) {
            game.phase = 'betting2';
            game.currentBet = 0;
            game.players.forEach(p => p.bet = 0);
          }
          this.notifyGameUpdate(game.id);
          break;
        default:
          throw new Error('Invalid action');
      }

      // If the next player is a bot, handle their turn immediately
      const nextPlayer = game.players.find(p => p.id === game.currentPlayer);
      if (nextPlayer?.id.startsWith('bot-')) {
        console.log('Next player is bot, handling bot turn');
        process.nextTick(() => this.handleBotTurn(game));
      }
    } catch (error) {
      console.error('Error performing action:', error);
      throw error;
    }
  }

  private handleBet(game: GameState, player: Player, amount: number): void {
    console.log('Handling bet:', { 
      playerId: player.id, 
      amount, 
      currentBet: game.currentBet,
      playerChips: player.chips 
    });
    
    if (amount <= game.currentBet) {
      throw new Error('Bet must be higher than current bet');
    }
    if (amount > player.chips) {
      throw new Error('Not enough chips');
    }

    // Update player's chips and bet
    player.chips -= amount;
    player.bet += amount;
    game.pot += amount;
    game.currentBet = amount;
    
    console.log('Bet handled:', { 
      playerChips: player.chips, 
      playerBet: player.bet, 
      pot: game.pot, 
      currentBet: game.currentBet 
    });

    // Move to next player and notify immediately
    this.moveToNextPlayer(game);
    this.notifyGameUpdate(game.id);
  }

  private handleCall(game: GameState, player: Player): void {
    console.log('Handling call:', { 
      playerId: player.id, 
      currentBet: game.currentBet, 
      playerBet: player.bet,
      playerChips: player.chips,
      phase: game.phase
    });
    
    const callAmount = game.currentBet - player.bet;
    if (callAmount > player.chips) {
      throw new Error('Not enough chips');
    }

    player.chips -= callAmount;
    player.bet += callAmount;
    game.pot += callAmount;
    
    console.log('Call handled:', { 
      playerChips: player.chips, 
      playerBet: player.bet, 
      pot: game.pot,
      phase: game.phase
    });

    // Check if this is single player mode (one human player and one bot)
    const isSinglePlayerMode = game.players.length === 2 && 
      game.players.some(p => p.id.startsWith('bot-')) && 
      game.players.some(p => !p.id.startsWith('bot-'));

    // If it's single player mode and the human player called (not checked),
    // and we're in the first betting round, advance to next phase
    if (isSinglePlayerMode && !player.id.startsWith('bot-') && callAmount > 0 && game.phase === 'betting1') {
      console.log('Single player mode: Human player called in betting1, advancing to next phase');
      this.advanceGamePhase(game);
      return;
    }

    // Check if all active players have matched the current bet
    const activePlayers = game.players.filter(p => !p.isFolded);
    const allBetsMatched = activePlayers.every(p => p.bet === game.currentBet);
    
    // For betting2, we need to check if we've completed a full round of betting
    // if (game.phase === 'betting2' && allBetsMatched) {
    //   const currentPlayerIndex = game.players.findIndex(p => p.id === game.currentPlayer);
    //   const lastPlayerIndex = game.players.findIndex(p => p.id === player.id);
    //   const hasCompletedRound = currentPlayerIndex <= lastPlayerIndex;
      
    //   if (hasCompletedRound) {
    //     console.log('Betting2 round complete, advancing to equation phase:', {
    //       phase: game.phase,
    //       currentBet: game.currentBet,
    //       playerBets: game.players.map(p => ({ id: p.id, bet: p.bet }))
    //     });
    //     this.advanceGamePhase(game);
    //     return;
    //   }
    // }
    
    // Otherwise, move to next player as normal
    this.moveToNextPlayer(game);
    this.notifyGameUpdate(game.id);
  }

  private handleFold(game: GameState, player: Player): void {
    console.log('Handling fold:', { 
      playerId: player.id,
      phase: game.phase,
      activePlayers: game.players.filter(p => !p.isFolded).length
    });

    // Mark player as folded
    player.isFolded = true;

    // Check if this was the last active player
    const activePlayers = game.players.filter(p => !p.isFolded);
    if (activePlayers.length <= 1) {
      // Only one player remaining, they win
      const winner = activePlayers[0];
      if (winner) {
        console.log('Last player folded, winner:', winner.id);
        game.winners.small = [winner.id];
        game.winners.big = [winner.id];
        winner.chips += game.pot;
        game.phase = 'ended';
        this.notifyGameUpdate(game.id);
        return;
      }
    }

    // Move to next player
    this.moveToNextPlayer(game);
    this.notifyGameUpdate(game.id);
  }

  private handleBetType(game: GameState, player: Player, betType: 'small' | 'big' | 'both'): void {
    console.log('Handling bet type:', { 
      playerId: player.id, 
      betType, 
      phase: game.phase 
    });
    
    if (game.phase !== 'equation') {
      throw new Error('Can only select bet type during equation phase');
    }
    player.betType = betType;
    // Do NOT move to next player or advance phase here
    this.notifyGameUpdate(game.id);
  }

  private handleSwap(game: GameState, player: Player, swapCardType: OperationType): void {
    console.log('Handling card swap:', { 
      playerId: player.id, 
      playerName: player.name,
      swapCardType,
      currentOperationCards: player.operationCards.map(c => c.operation)
    });
    
    // Find the card to swap out
    const cardIndex = player.operationCards.findIndex(card => card.operation === swapCardType);
    if (cardIndex === -1) {
      throw new Error(`Card type ${swapCardType} not found in player's operation cards`);
    }
    
    // Remove the selected card
    const swappedCard = player.operationCards.splice(cardIndex, 1)[0];
    
    // Add the multiply card to player's cards
    const multiplyCard = { type: 'operation' as const, operation: 'multiply' as const };
    player.cards.push(multiplyCard);
    
    // Reset the multiply flag
    player.hasMultiply = false;
    
    console.log('Card swap completed:', {
      playerId: player.id,
      playerName: player.name,
      swappedOut: swappedCard.operation,
      swappedIn: 'multiply',
      remainingOperationCards: player.operationCards.map(c => c.operation)
    });
    
    // Continue with dealing the next card
    this.continueDealing(game);
    
    // Notify game update after swap
    this.notifyGameUpdate(game.id);
  }

  private continueDealing(game: GameState): void {
    // Continue dealing cards to complete the current phase
    const currentPhase = game.phase;
    let targetCards = 0;
    
    if (currentPhase === 'dealing1') {
      // During dealing1, deal exactly 2 number cards
      targetCards = 2;
    } else if (currentPhase === 'dealing2') {
      // During dealing2, deal exactly 4 number cards
      targetCards = 4;
    }
    
    if (targetCards > 0) {
      console.log('Continuing to deal cards after swap:', { targetCards, phase: currentPhase });
      this.dealCards(game, targetCards, true);
    }
  }

  private moveToNextPlayer(game: GameState): void {
    // Find the current player's index
    const currentPlayerIndex = game.players.findIndex(p => p.id === game.currentPlayer);
    if (currentPlayerIndex === -1) return;

    // Find the next active player
    let nextPlayerIndex = (currentPlayerIndex + 1) % game.players.length;
    while (game.players[nextPlayerIndex].isFolded) {
      nextPlayerIndex = (nextPlayerIndex + 1) % game.players.length;
    }

    // Check if we've gone all the way around
    const hasCompletedRound = nextPlayerIndex <= currentPlayerIndex;

    // If we've completed a round, check if all active players have matched the current bet
    if (hasCompletedRound) {
      const activePlayers = game.players.filter(p => !p.isFolded);
      const allBetsMatched = activePlayers.every(p => p.bet === game.currentBet);

      if (allBetsMatched) {
        if (game.phase === 'betting1') {
          console.log('Betting1 round complete, advancing to next phase:', {
            phase: game.phase,
            currentBet: game.currentBet,
            playerBets: game.players.map(p => ({ id: p.id, bet: p.bet }))
          });
          this.advanceGamePhase(game);
          return;
        } else if (game.phase === 'betting2') {
          console.log('Betting2 round complete, advancing to equation phase:', {
            phase: game.phase,
            currentBet: game.currentBet,
            playerBets: game.players.map(p => ({ id: p.id, bet: p.bet }))
          });
          this.advanceGamePhase(game);
          return;
        }
      }
    }

    // If we haven't completed the round or bets aren't matched, move to next player
    game.currentPlayer = game.players[nextPlayerIndex].id;

    // Handle bot turns immediately
    if (game.currentPlayer.startsWith('bot-')) {
      this.handleBotTurn(game);
    }
  }

  private advanceGamePhase(game: GameState): void {
    console.log('Advancing game phase:', { 
      currentPhase: game.phase,
      activePlayers: game.players.filter(p => !p.isFolded).length
    });

    // Reset current bet and player bets at the start of new betting rounds
    if (game.phase === 'betting1') {
      // After first betting round, move to dealing2 phase
      game.phase = 'dealing2';
      // Deal additional cards (total of 4)
      this.dealCards(game, 4, true);
    } else if (game.phase === 'betting2') {
      // After second betting round, move to equation phase
      game.phase = 'equation';
      // Set the first active player as current player for equation phase
      const firstActivePlayer = game.players.find(p => !p.isFolded);
      if (firstActivePlayer) {
        game.currentPlayer = firstActivePlayer.id;
        // Handle bot turns immediately
        if (game.currentPlayer.startsWith('bot-')) {
          this.handleBotTurn(game);
        }
      }
    } else if (game.phase === 'equation') {
      // After equation phase, end the game
      this.endGame(game);
      return;
    }

    this.notifyGameUpdate(game.id);
  }

  private determineWinners(game: GameState): void {
    this.resolveEquationsAndDistributePot(game); 
  }

  private dealInitialCards(game: GameState): void {
    // Deal initial 2 number cards to each player
    this.dealCards(game, 2, true); // true indicates we want exactly 2 number cards
    // After dealing initial cards, automatically advance to betting1
    // But only if no players are waiting for card swap
    const waitingForSwap = game.players.some(p => p.hasMultiply);
    if (!waitingForSwap) {
      game.phase = 'betting1';
      this.notifyGameUpdate(game.id);
    }
  }

  private dealCards(game: GameState, targetNumberCards: number, requireExactNumberCards: boolean = false): void {
    console.log('Dealing cards:', { targetNumberCards, phase: game.phase, requireExactNumberCards });
    
    // Deal cards to each player until they have the target number of number cards
    for (const player of game.players) {
      // Skip players who are waiting for card swap
      // if (player.hasMultiply) {
      //   console.log('Player waiting for card swap, skipping:', player.id);
      //   continue;
      // }
      
      while (player.cards.filter(c => c.type === 'number').length < targetNumberCards) {
        if (game.deck.length === 0) {
          console.error('Deck is empty but players still need cards');
          return;
        }

        const card = game.deck.pop()!;

        if (card.type === 'operation' && card.operation === 'squareRoot'){
          console.log('Player received square root card, adding to operation cards:');
          player.isSquareRoot = true;
          player.cards.push(card);
          continue;
        }
        
        // Handle multiply card swapping
        if (card.type === 'operation' && card.operation === 'multiply') {
          // Check if player already has a multiply card
          const hasMultiplyCard = player.cards.some(c => c.type === 'operation' && c.operation === 'multiply') || player.hasMultiply;
          if (hasMultiplyCard) {
            console.log('Player already has multiply card, discarding new one:', { 
              playerId: player.id, 
              playerName: player.name 
            });
            // Discard the multiply card (don't add it to player's cards)
            continue;
          }
          
          if (player.isSquareRoot) {
            console.error('Cannot swap multiply card while player has square root card');
            continue; // Skip swapping if player has square root card
          }
          console.log('Player received multiply card, initiating swap:', { 
            playerId: player.id, 
            playerName: player.name,
            currentOperationCards: player.operationCards.map(c => c.operation)
          });
          
          // Only swap if player has operation cards and is not a bot
          if (player.operationCards.length > 0 && !player.id.startsWith('bot-')) {
            // Emit requireSwap event only to the specific player
            if (this.io) {
              this.io.to(player.id).emit('requireSwap', {
                playerId: player.id,
                playerName: player.name,
                availableCards: player.operationCards.map(c => c.operation),
                multiplyCard: card
              });
            }
            // Store the multiply card temporarily and wait for swap response
            player.hasMultiply = true;
            // Stop dealing cards and wait for this player's swap response
            console.log('Stopping card dealing to wait for swap response from:', player.id);
            return;
          } else if (player.id.startsWith('bot-')) {
            // For bots, randomly select one operation card to swap
            const randomIndex = Math.floor(Math.random() * player.operationCards.length);
            const swappedCard = player.operationCards[randomIndex];
            
            // Remove the swapped card
            player.operationCards.splice(randomIndex, 1);
            
            // Add the multiply card to player's cards
            player.cards.push(card);
            
            console.log('Bot card swap completed:', {
              playerId: player.id,
              playerName: player.name,
              swappedOut: swappedCard.operation,
              swappedIn: 'multiply',
              remainingOperationCards: player.operationCards.map(c => c.operation)
            });
          } else {
            // If no operation cards to swap, just add the multiply card
            player.cards.push(card);
          }
        } else if (card.type === 'number') {
          // For number cards, add them until we reach the target
          player.cards.push(card);
        } else {
          // For other operation cards, just add them
          player.cards.push(card);
        }
        player.isSquareRoot = false; // Reset square root status for next card
      }
    }

    // Verify that all players have exactly the target number of number cards
    // Skip players who are waiting for card swap
    const allPlayersHaveTargetCards = game.players.every(p => 
      p.hasMultiply || p.cards.filter(c => c.type === 'number').length === targetNumberCards
    );

    if (requireExactNumberCards && !allPlayersHaveTargetCards) {
      console.error('Not all players have the required number of number cards');
      // Check if any player is waiting for swap
      const waitingForSwap = game.players.some(p => p.hasMultiply);
      if (waitingForSwap) {
        console.log('Some players are waiting for card swap, not retrying deal');
        return;
      }
      
      // Put all cards back in the deck and try again
      for (const player of game.players) {
        while (player.cards.length > 0) {
          const card = player.cards.pop()!;
          if (card.type === 'operation' && card.operation === 'multiply') {
            // Put multiply cards back in the deck
            game.deck.unshift(card);
          }
        }
      }
      // Recursively try again
      this.dealCards(game, targetNumberCards, requireExactNumberCards);
      return;
    }

    // Check if we need to advance the game phase after dealing
    const waitingForSwap = game.players.some(p => p.hasMultiply);
    if (!waitingForSwap) {
      // If we're in dealing1 phase and all players have 2 cards, advance to betting1
      if (game.phase === 'dealing1') {
        const allPlayersHave2Cards = game.players.every(p => 
          p.cards.filter(c => c.type === 'number').length >= 2
        );
        if (allPlayersHave2Cards) {
          console.log('All players have 2 cards, advancing to betting1');
          game.phase = 'betting1';
        }
      }
      // If we're in dealing2 phase and all players have 4 cards, advance to betting2
      else if (game.phase === 'dealing2') {
        const allPlayersHave4Cards = game.players.every(p => 
          p.cards.filter(c => c.type === 'number').length >= 4
        );
        if (allPlayersHave4Cards) {
          console.log('All players have 4 cards, advancing to betting2');
          game.phase = 'betting2';
          game.currentBet = 0;
          game.players.forEach(p => p.bet = 0);
          const firstActivePlayer = game.players.find(p => !p.isFolded);
          if (firstActivePlayer) {
            game.currentPlayer = firstActivePlayer.id;
            if (game.currentPlayer.startsWith('bot-')) {
              this.handleBotTurn(game);
            }
          }
        }
      }
    }
    
    // Notify after dealing cards
    this.notifyGameUpdate(game.id);
  }

  private createDeck(): Card[] {
    const deck: Card[] = [];
    const colors: Array<'gold' | 'silver' | 'bronze' | 'dark'> = ['gold', 'silver', 'bronze', 'dark'];
    
    // Add number cards
    for (const color of colors) {
      for (let value = 0; value <= 10; value++) {
        deck.push({ type: 'number', value, color });
      }
    }

    // Add operation cards
    for (let i = 0; i < 4; i++) {
      deck.push({ type: 'operation', operation: 'multiply' });
      deck.push({ type: 'operation', operation: 'squareRoot' });
    }

    // Shuffle the deck
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck;
  }

  private notifyGameUpdate(gameId: string): void {
    if (!this.io) {
      console.error('Socket.IO not initialized');
      return;
    }

    const game = this.games.get(gameId);
    if (!game) {
      console.error('Game not found for update:', gameId);
      return;
    }

    // Create a deep copy of the game state to prevent any race conditions
    const gameState = JSON.parse(JSON.stringify(game));
    
    console.log('Notifying game update:', { 
      gameId, 
      phase: gameState.phase,
      currentPlayer: gameState.currentPlayer,
      activePlayers: gameState.players.filter((p: Player) => !p.isFolded).length
    });

    // Emit to the specific game room
    this.io.to(gameId).emit('gameUpdate', gameState);
  }

  private endGame(game: GameState): void {
    this.determineWinners(game);
    game.phase = 'ended';
    this.notifyGameUpdate(game.id);
  }

  private resolveEquationsAndDistributePot(game: GameState): void {
    // Helper to safely evaluate a math expression string (using same logic as EquationBuilder)
    function safeEval(expr: string): number | null {
      try {
        // Convert equation to tokens with proper grouping for square root
        const tokens: Array<{ type: 'number' | 'operator' | 'sqrt', value: string }> = [];
        const parts = expr.split(/(sqrt|[\+\-\*\/\(\)])/).filter(p => p.trim());
        
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
          } else if (['+','-','*','/'].includes(part)) {
            tokens.push({ 
              type: 'operator', 
              value: part === '*' ? '*' :
                     part === '/' ? '/' :
                     part === '+' ? '+' :
                     part === '-' ? '-' : ''
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
    const equationResults: Array<{
      playerId: string;
      playerName: string;
      betType: 'small' | 'big' | 'both';
      equations: { small?: { expr: string; result: number }; big?: { expr: string; result: number } };
    }> = [];

    // Collect results
    const results: { player: Player; small?: number; big?: number }[] = [];
    for (const player of game.players) {
      if (player.isFolded || !player.betType) continue;
      
      const entry: { player: Player; small?: number; big?: number } = { player };
      const eqResults: { small?: { expr: string; result: number }; big?: { expr: string; result: number } } = {};
      
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
      
      results.push(entry);
      equationResults.push({
        playerId: player.id,
        playerName: player.name,
        betType: player.betType,
        equations: eqResults
      });
    }
    // Card color values (ascending order)
    const colorValues: Record<string, number> = {
      'dark': 0,
      'bronze': 1,
      'silver': 2,
      'gold': 3
    };

    // Find winners with tiebreaker logic
    let smallWinners: Player[] = [];
    let bigWinners: Player[] = [];
    let minSmallDiff = Infinity;
    let minBigDiff = Infinity;

    // Check if all players bet the same type
    const allSmall = results.every(r => r.player.betType === 'small');
    const allBig = results.every(r => r.player.betType === 'big');

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

    // Apply tiebreakers
    const smallWinner = smallWinners.length > 0 ? smallWinners.reduce((a, b) => {
      // For small bet: compare smallest card's color (ascending order)
      const aMinCard = Math.min(...a.cards.filter(c => c.type === 'number').map(c => colorValues[c.color]));
      const bMinCard = Math.min(...b.cards.filter(c => c.type === 'number').map(c => colorValues[c.color]));
      return aMinCard < bMinCard ? a : b;
    }) : null;

    const bigWinner = bigWinners.length > 0 ? bigWinners.reduce((a, b) => {
      // For big bet: compare biggest card's color (ascending order)
      const aMaxCard = Math.max(...a.cards.filter(c => c.type === 'number').map(c => colorValues[c.color]));
      const bMaxCard = Math.max(...b.cards.filter(c => c.type === 'number').map(c => colorValues[c.color]));
      return aMaxCard > bMaxCard ? a : b;
    }) : null;

    // Store equation results in game state for client display
    game.equationResults = equationResults;

    // Distribute pot with tiebreaker support
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
      // Split pot (tiebreakers already applied)
      if (smallWinner) {
        smallWinner.chips += Math.floor(game.pot / 2);
        game.winners.small = [smallWinner.id];
      }
      if (bigWinner) {
        bigWinner.chips += Math.ceil(game.pot / 2);
        game.winners.big = [bigWinner.id];
      }
    }

    // Clear pot
    game.pot = 0;
  }
} 