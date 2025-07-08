import { v4 as uuidv4 } from 'uuid';
import { Card, GameState, Player, OperationCard, CardColor, OperationType } from './types';

export class GameService {
  private createDeck(): Card[] {
    const deck: Card[] = [];
    const colors: CardColor[] = ['gold', 'silver', 'bronze', 'dark'];
    
    // Create number cards (1-10) for each color
    colors.forEach(color => {
      for (let i = 1; i <= 10; i++) {
        deck.push({ type: 'number', value: i, color });
      }
    });

    // Add operation cards
    for (let i = 0; i < 4; i++) {
      deck.push({ type: 'operation', operation: 'divide' });
      deck.push({ type: 'operation', operation: 'squareRoot' });
    }

    return this.shuffleDeck(deck);
  }

  private shuffleDeck(deck: Card[]): Card[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  createGame(): GameState {
    return {
      id: uuidv4(),
      players: [],
      deck: this.createDeck(),
      currentPlayer: null,
      pot: 0,
      currentBet: 0,
      phase: 'waiting',
      round: 1,
      winners: {
        small: [],
        big: []
      }
    };
  }

  addPlayer(game: GameState, name: string): Player {
    const player: Player = {
      id: uuidv4(),
      name,
      chips: 100, // Starting chips
      cards: [],
      operationCards: [
        { type: 'operation', operation: 'add' },
        { type: 'operation', operation: 'subtract' },
        { type: 'operation', operation: 'multiply' }
      ],
      bet: 0,
      betType: null,
      isActive: true,
      isFolded: false
    };

    game.players.push(player);
    return player;
  }

  startGame(game: GameState): void {
    if (game.players.length < 2) {
      throw new Error('Need at least 2 players to start the game');
    }

    game.deck = this.createDeck();
    game.phase = 'betting1';
    game.currentPlayer = game.players[0].id;
    game.currentBet = 1; // Initial bet of 1 chip

    // Collect initial bets
    game.players.forEach(player => {
      player.chips -= 1;
      player.bet = 1;
      game.pot += 1;
    });
  }

  dealCards(game: GameState): void {
    const currentPhase = game.phase;
    const cardsToDeal = currentPhase === 'dealing1' ? 2 : 
                       currentPhase === 'dealing2' ? 1 :
                       currentPhase === 'dealing3' ? 1 : 0;

    if (cardsToDeal === 0) return;

    game.players.forEach(player => {
      for (let i = 0; i < cardsToDeal; i++) {
        if (game.deck.length === 0) {
          game.deck = this.createDeck();
        }
        const card = game.deck.pop()!;
        
        // Handle special cards
        if (card.type === 'operation') {
          if (card.operation === 'divide') {
            // Player needs to choose which operation card to replace
            // This will be handled by the client
          } else if (card.operation === 'squareRoot') {
            // Deal one extra card
            const extraCard = game.deck.pop()!;
            player.cards.push(extraCard);
          }
        }
        
        player.cards.push(card);
      }
    });

    // Update game phase
    if (currentPhase === 'dealing1') game.phase = 'betting2';
    else if (currentPhase === 'dealing2') game.phase = 'betting3';
    else if (currentPhase === 'dealing3') game.phase = 'equation';
  }

  handleAction(game: GameState, action: { type: string; playerId: string; amount?: number; betType?: 'small' | 'big' | 'both' }): void {
    const player = game.players.find(p => p.id === action.playerId);
    if (!player || !player.isActive || player.isFolded) return;

    switch (action.type) {
      case 'bet':
      case 'raise':
        if (!action.amount) return;
        const betAmount = action.amount;
        if (betAmount > player.chips) return;
        
        player.chips -= betAmount;
        player.bet += betAmount;
        game.pot += betAmount;
        game.currentBet = Math.max(game.currentBet, player.bet);
        break;

      case 'fold':
        player.isFolded = true;
        break;

      case 'call':
        const callAmount = game.currentBet - player.bet;
        if (callAmount > player.chips) return;
        
        player.chips -= callAmount;
        player.bet += callAmount;
        game.pot += callAmount;
        break;

      case 'selectBetType':
        if (!action.betType) return;
        player.betType = action.betType;
        break;
    }

    // Move to next player or phase
    this.updateGamePhase(game);
  }

  private updateGamePhase(game: GameState): void {
    const activePlayers = game.players.filter(p => p.isActive && !p.isFolded);
    
    // Check if betting round is complete
    const bettingComplete = activePlayers.every(p => p.bet === game.currentBet || p.isFolded);
    
    if (bettingComplete) {
      switch (game.phase) {
        case 'betting1':
          game.phase = 'dealing1';
          this.dealCards(game);
          break;
        case 'betting2':
          game.phase = 'dealing2';
          this.dealCards(game);
          break;
        case 'betting3':
          game.phase = 'dealing3';
          this.dealCards(game);
          break;
        case 'equation':
          this.determineWinners(game);
          game.phase = 'ended';
          break;
      }
    }

    // Update current player
    if (game.phase.startsWith('betting')) {
      const currentIndex = game.players.findIndex(p => p.id === game.currentPlayer);
      let nextIndex = (currentIndex + 1) % game.players.length;
      
      while (game.players[nextIndex].isFolded || !game.players[nextIndex].isActive) {
        nextIndex = (nextIndex + 1) % game.players.length;
      }
      
      game.currentPlayer = game.players[nextIndex].id;
    }
  }

  private determineWinners(game: GameState): void {
    const activePlayers = game.players.filter(p => !p.isFolded);
    
    // Calculate results for each player
    const results = activePlayers.map(player => {
      // This is a placeholder - actual equation evaluation will be implemented
      const smallResult = 0; // Calculate based on equation
      const bigResult = 0;   // Calculate based on equation
      
      return {
        playerId: player.id,
        smallResult,
        bigResult,
        betType: player.betType
      };
    });

    // Determine small winner
    const smallPlayers = results.filter(r => r.betType === 'small' || r.betType === 'both');
    if (smallPlayers.length > 0) {
      const smallWinner = smallPlayers.reduce((a, b) => 
        Math.abs(a.smallResult - 1) < Math.abs(b.smallResult - 1) ? a : b
      );
      game.winners.small.push(smallWinner.playerId);
    }

    // Determine big winner
    const bigPlayers = results.filter(r => r.betType === 'big' || r.betType === 'both');
    if (bigPlayers.length > 0) {
      const bigWinner = bigPlayers.reduce((a, b) => 
        Math.abs(a.bigResult - 20) < Math.abs(b.bigResult - 20) ? a : b
      );
      game.winners.big.push(bigWinner.playerId);
    }

    // Distribute pot
    this.distributePot(game);
  }

  private distributePot(game: GameState): void {
    const { small, big } = game.winners;
    const potPerWinner = game.pot / (small.length + big.length);

    game.players.forEach(player => {
      if (small.includes(player.id)) {
        player.chips += potPerWinner;
      }
      if (big.includes(player.id)) {
        player.chips += potPerWinner;
      }
    });
  }
} 