import express, { Request, Response } from 'express';
import { GameService } from '../services/gameService';

const router = express.Router();

// Export a function to initialize the router with a GameService instance
export default function createGameRoutes(gameService: GameService) {
  // Create a new game
  router.post('/', (req: Request, res: Response) => {
    try {
      const game = gameService.createGame();
      console.log('Created new game:', game);
      res.json({ id: game.id });
    } catch (error) {
      console.error('Error creating game:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : 'Failed to create game',
        error: error instanceof Error ? error.stack : undefined
      });
    }
  });

  // Get game state
  router.get('/:gameId', (req: Request, res: Response) => {
    try {
      const { gameId } = req.params;
      const game = gameService.getGame(gameId);
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }
      res.json(game);
    } catch (error) {
      console.error('Error getting game:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : 'Failed to get game',
        error: error instanceof Error ? error.stack : undefined
      });
    }
  });

  // Join a game
  router.post('/:gameId/join', (req: Request, res: Response) => {
    try {
      const { gameId } = req.params;
      const { playerName, playerId } = req.body;

      if (!playerName) {
        throw new Error('Player name is required');
      }

      console.log('Player joining game:', { gameId, playerName, playerId });
      const newPlayerId = gameService.joinGame(gameId, playerName, playerId);
      console.log('Player joined successfully:', newPlayerId);
      res.json({ playerId: newPlayerId });
    } catch (error) {
      console.error('Error joining game:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : 'Failed to join game',
        error: error instanceof Error ? error.stack : undefined
      });
    }
  });

  // Start a game
  router.post('/:gameId/start', (req: Request, res: Response) => {
    try {
      const { gameId } = req.params;
      console.log('Received start game request for game:', gameId);
      
      gameService.startGame(gameId);
      console.log('Game started successfully');
      
      // Send the updated game state in the response
      const game = gameService.getGame(gameId);
      res.json(game);
    } catch (error) {
      console.error('Error starting game:', error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : 'Failed to start game',
        error: error instanceof Error ? error.stack : undefined
      });
    }
  });

  // Perform a game action
  router.post('/:gameId/action', (req: Request, res: Response) => {
    try {
      const { gameId } = req.params;
      const action = req.body;
      
      console.log('Received game action:', { gameId, action });
      gameService.performAction(gameId, action);
      console.log('Action performed successfully');
      
      // Send the updated game state in the response
      const game = gameService.getGame(gameId);
      res.json(game);
    } catch (error) {
      console.error('Error performing action:', error);
      res.status(400).json({ 
        message: error instanceof Error ? error.message : 'Failed to perform action',
        error: error instanceof Error ? error.stack : undefined
      });
    }
  });

  return router;
} 