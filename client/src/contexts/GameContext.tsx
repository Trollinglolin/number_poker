import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import { GameState, GameAction, GameEvent } from '../shared/types';
import { useToast } from '@chakra-ui/react';

interface GameContextType {
  game: GameState | null;
  playerId: string | null;
  gameId: string | null;
  error: string | null;
  createGame: () => Promise<string>;
  joinGame: (gameId: string, playerName: string, existingPlayerId?: string) => Promise<string>;
  startGame: () => Promise<void>;
  startGameWithBot: () => Promise<void>;
  resetChips: () => Promise<void>;
  performAction: (action: GameAction) => void;
  socket: Socket | null;
  swapRequest: {
    playerId: string;
    playerName: string;
    availableCards: string[];
    multiplyCard: any;
  } | null;
  setSwapRequest: (request: any) => void;
}

const GameContext = createContext<GameContextType | null>(null);

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
};

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [game, setGame] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [swapRequest, setSwapRequest] = useState<{
    playerId: string;
    playerName: string;
    availableCards: string[];
    multiplyCard: any;
  } | null>(null);
  const joinInProgress = useRef(false);
  const lastJoinedGame = useRef<string | null>(null);
  const pendingGameJoin = useRef<{ gameId: string; playerId: string } | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const socketInitialized = useRef(false);
  const toast = useToast();

  // Initialize socket connection only once and keep it alive
  useEffect(() => {
    if (!socketInitialized.current) {
      console.log('Initializing socket connection...');
      
      // Use relative URL for production, localhost for development
      const socketUrl = process.env.NODE_ENV === 'production' 
        ? window.location.origin 
        : 'http://localhost:3001';
      
      const newSocket = io(socketUrl, {
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        transports: ['websocket'],
        forceNew: false,
        autoConnect: true,
        reconnection: true,
        timeout: 10000
      });

      socketRef.current = newSocket;
      socketInitialized.current = true;

      newSocket.on('connect', () => {
        console.log('Socket connected:', newSocket.id);
        
        // If there's a pending game join, process it now
        if (pendingGameJoin.current) {
          const { gameId, playerId } = pendingGameJoin.current;
          console.log('Processing pending game join:', { gameId, playerId });
          newSocket.emit('joinGame', { gameId, playerId });
          pendingGameJoin.current = null;
        }
      });

      newSocket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        // Only attempt to reconnect if it wasn't a client-side disconnect
        if (reason === 'io server disconnect') {
          console.log('Server disconnected, attempting to reconnect...');
          newSocket.connect();
        }
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        toast({
          title: 'Connection Error',
          description: 'Failed to connect to game server. Please try refreshing the page.',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
        setError('Failed to connect to game server');
      });

      newSocket.on('gameUpdate', (updatedGame: GameState) => {
        console.log('Received game update:', { 
          gameId: updatedGame.id, 
          phase: updatedGame.phase,
          currentPlayer: updatedGame.currentPlayer,
          playerId,
          oldPhase: game?.phase,
          oldCurrentPlayer: game?.currentPlayer,
          oldPot: game?.pot,
          oldCurrentBet: game?.currentBet,
          oldPlayerStates: game?.players.map(p => ({ id: p.id, chips: p.chips, bet: p.bet, isFolded: p.isFolded }))
        });

        // Always update the game state to ensure we get bot actions
        setGame(updatedGame);

        // Notify about significant state changes
        if (game) {
          // Phase change notification
          if (game.phase !== updatedGame.phase) {
            toast({
              title: 'Game Phase',
              description: `Phase changed to: ${updatedGame.phase}`,
              status: 'info',
              duration: 3000,
              isClosable: true,
            });
          }

          // Turn change notification - only if it's a real turn change
          if (game.currentPlayer !== updatedGame.currentPlayer && 
              updatedGame.phase !== 'ended' && 
              !updatedGame.players.find(p => p.id === updatedGame.currentPlayer)?.isFolded) {
            const newPlayer = updatedGame.players.find(p => p.id === updatedGame.currentPlayer);
            if (newPlayer) {
              // Only show turn notification if it's not a bot's turn
              if (!newPlayer.id.startsWith('bot-')) {
                toast({
                  title: 'Turn Change',
                  description: `It's ${newPlayer.name}'s turn`,
                  status: 'info',
                  duration: 2000,
                  isClosable: true,
                });
              }
            }
          }

          // Bot action notifications - only show for actual actions
          const oldPlayer = game.players.find(p => p.id === game.currentPlayer);
          const newPlayer = updatedGame.players.find(p => p.id === game.currentPlayer);
          if (oldPlayer && newPlayer && oldPlayer.id.startsWith('bot-')) {
            // Check for bot actions - only if there's a real change
            if (oldPlayer.chips !== newPlayer.chips || 
                oldPlayer.isFolded !== newPlayer.isFolded || 
                oldPlayer.bet !== newPlayer.bet) {
              let action = '';
              if (oldPlayer.isFolded !== newPlayer.isFolded && newPlayer.isFolded) {
                action = 'folded';
              } else if (oldPlayer.bet < newPlayer.bet) {
                action = newPlayer.bet === game.currentBet ? 'called' : `bet ${newPlayer.bet - oldPlayer.bet}`;
              }
              
              if (action) {
                toast({
                  title: 'Bot Action',
                  description: `Bot ${action}`,
                  status: 'info',
                  duration: 2000,
                  isClosable: true,
                });
              }
            }
          }
        }
      });

      newSocket.on('error', (error: { message: string }) => {
        console.error('Socket error:', error);
        setError(error.message);
        toast({
          title: 'Game Error',
          description: error.message,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      });

      newSocket.on('requireSwap', (swapData: {
        playerId: string;
        playerName: string;
        availableCards: string[];
        multiplyCard: any;
      }) => {
        console.log('Received swap request:', swapData);
        // Set swap request - the modal will check if it's for the current player
        setSwapRequest(swapData);
        // Only show toast if it's for the current player
        if (swapData.playerId === playerId) {
          toast({
            title: 'Card Swap Required',
            description: `You received a multiply card! Choose which operation card to swap.`,
            status: 'info',
            duration: 5000,
            isClosable: true,
          });
        }
      });
    }

    // Only clean up on component unmount
    return () => {
      console.log('Component unmounting, cleaning up socket connection');
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        socketInitialized.current = false;
      }
    };
  }, []); // Empty dependency array - only run once on mount

  const createGame = async () => {
    try {
      const baseUrl = process.env.NODE_ENV === 'production' 
        ? window.location.origin 
        : 'http://localhost:3001';
      
      const response = await axios.post(`${baseUrl}/api/games`);
      const gameData = response.data;
      if (!gameData || !gameData.id) {
        throw new Error('Invalid game data received from server');
      }
      console.log('Created new game:', gameData.id);
      setGameId(gameData.id);
      return gameData.id;
    } catch (err) {
      console.error('Error creating game:', err);
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || 'Failed to create game');
      } else {
        setError('Failed to create game');
      }
      throw err;
    }
  };

  const joinGame = async (gameId: string, playerName: string, existingPlayerId?: string) => {
    // Validate gameId is a string
    if (typeof gameId !== 'string') {
      console.error('Invalid game ID type:', typeof gameId);
      throw new Error('Invalid game ID format');
    }

    // Check if we're already in this game
    if (lastJoinedGame.current === gameId && !existingPlayerId) {
      console.log('Already joined this game:', gameId);
      return;
    }

    // Check if a join is in progress
    if (joinInProgress.current) {
      console.log('Join already in progress, ignoring request');
      return;
    }

    try {
      joinInProgress.current = true;
      console.log('Attempting to join game:', { gameId, playerName, existingPlayerId });
      
      // Only validate game ID format if we're joining an existing game
      // (not when creating a new game)
      if (gameId !== lastJoinedGame.current) {
        try {
          const baseUrl = process.env.NODE_ENV === 'production' 
            ? window.location.origin 
            : 'http://localhost:3001';
          const gameCheck = await axios.get(`${baseUrl}/api/games/${gameId}`);
          if (!gameCheck.data) {
            throw new Error('Game not found');
          }
        } catch (err) {
          if (axios.isAxiosError(err) && err.response?.status === 404) {
            throw new Error('Game not found');
          }
          throw err;
        }
      }

      const baseUrl = process.env.NODE_ENV === 'production' 
        ? window.location.origin 
        : 'http://localhost:3001';
      const response = await axios.post(`${baseUrl}/api/games/${gameId}/join`, {
        playerName,
        playerId: existingPlayerId
      });
      
      console.log('Join game response:', response.data);
      const { playerId: newPlayerId } = response.data;
      
      // Update state
      setPlayerId(newPlayerId);
      setGameId(gameId);
      lastJoinedGame.current = gameId;
      setError(null);

      // Handle socket room joining
      if (socketRef.current?.connected) {
        console.log('Socket ready, joining game room:', gameId);
        socketRef.current.emit('joinGame', { gameId, playerId: newPlayerId });
        
        // Fetch current game state after joining
        try {
          const baseUrl = process.env.NODE_ENV === 'production' 
            ? window.location.origin 
            : 'http://localhost:3001';
          const gameState = await axios.get(`${baseUrl}/api/games/${gameId}`);
          setGame(gameState.data);
        } catch (err) {
          console.error('Error fetching game state:', err);
          toast({
            title: 'Error',
            description: 'Failed to fetch game state. Please try refreshing the page.',
            status: 'error',
            duration: 5000,
            isClosable: true,
          });
        }
      } else {
        console.log('Socket not ready, queuing game join');
        pendingGameJoin.current = { gameId, playerId: newPlayerId };
      }

      return newPlayerId;
    } catch (err) {
      console.error('Error joining game:', err);
      let errorMessage = 'Failed to join game';
      
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 400) {
          errorMessage = 'Invalid game ID or game not found';
        } else if (err.response?.status === 404) {
          errorMessage = 'Game not found';
        } else if (err.response?.status === 409) {
          errorMessage = 'Game is already in progress';
        } else {
          errorMessage = err.response?.data?.message || errorMessage;
        }
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      joinInProgress.current = false;
    }
  };

  const startGame = async () => {
    if (!gameId) {
      throw new Error('No game ID available');
    }
    try {
      console.log('Sending start game request...', { gameId });
      const baseUrl = process.env.NODE_ENV === 'production' 
        ? window.location.origin 
        : 'http://localhost:3001';
      const response = await axios.post(`${baseUrl}/api/games/${gameId}/start`);
      console.log('Start game response:', response.data);
      
      // Wait a moment for the socket to receive the update
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // If the game hasn't updated, try to fetch the current state
      if (!game || game.phase === 'waiting') {
        console.log('Game state not updated via socket, fetching current state...');
        const gameResponse = await axios.get(`${baseUrl}/api/games/${gameId}`);
        setGame(gameResponse.data);
      }
    } catch (error) {
      console.error('Error in startGame:', error);
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message || 'Failed to start game');
      }
      throw error;
    }
  };

  const startGameWithBot = async () => {
    if (!gameId) {
      throw new Error('No game ID available');
    }
    try {
      console.log('Sending start game with bot request...', { gameId });
      const baseUrl = process.env.NODE_ENV === 'production' 
        ? window.location.origin 
        : 'http://localhost:3001';
      const response = await axios.post(`${baseUrl}/api/games/${gameId}/start-with-bot`);
      console.log('Start game with bot response:', response.data);
      
      // Wait a moment for the socket to receive the update
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // If the game hasn't updated, try to fetch the current state
      if (!game || game.phase === 'waiting') {
        console.log('Game state not updated via socket, fetching current state...');
        const gameResponse = await axios.get(`${baseUrl}/api/games/${gameId}`);
        setGame(gameResponse.data);
      }
    } catch (error) {
      console.error('Error in startGameWithBot:', error);
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message || 'Failed to start game with bot');
      }
      throw error;
    }
  };

  const resetChips = async () => {
    if (!gameId) return;
    
    try {
      const baseUrl = process.env.NODE_ENV === 'production' 
        ? window.location.origin 
        : 'http://localhost:3001';
      const response = await axios.post(`${baseUrl}/api/games/${gameId}/reset-chips`);
      setGame(response.data);
    } catch (err) {
      console.error('Error resetting chips:', err);
      throw err;
    }
  };

  const performAction = async (action: GameAction) => {
    if (!socketRef.current?.connected) {
      throw new Error('Not connected to game server');
    }

    if (!gameId) {
      throw new Error('No game ID available');
    }

    try {
      console.log('Performing action:', { gameId, action });
      socketRef.current.emit('gameAction', { gameId, action });
    } catch (error) {
      console.error('Error performing action:', error);
      setError(error instanceof Error ? error.message : 'Failed to perform action');
      throw error;
    }
  };

  const value = {
    game,
    playerId,
    gameId,
    error,
    createGame,
    joinGame,
    startGame,
    startGameWithBot,
    resetChips,
    performAction,
    socket: socketRef.current,
    swapRequest,
    setSwapRequest,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};