import React, { useState, useCallback } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  VStack,
  Heading,
  Text,
  useToast,
  Container
} from '@chakra-ui/react';
import { useGame } from '../contexts/GameContext';

export const GameLobby: React.FC = () => {
  const { createGame, joinGame, error } = useGame();
  const [playerName, setPlayerName] = useState('');
  const [gameId, setGameId] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const toast = useToast();

  // Check for stored session on component mount
  React.useEffect(() => {
    const storedSession = localStorage.getItem('numberPokerSession');
    if (storedSession) {
      try {
        const session = JSON.parse(storedSession);
        setPlayerName(session.playerName || '');
        setGameId(session.gameId || '');
      } catch (err) {
        console.error('Error parsing stored session:', err);
        localStorage.removeItem('numberPokerSession');
      }
    }
  }, []);

  // Store session when joining a game
  const storeSession = (playerName: string, gameId: string, playerId: string) => {
    localStorage.setItem('numberPokerSession', JSON.stringify({
      playerName,
      gameId,
      playerId,
      timestamp: Date.now()
    }));
  };

  // Clear stored session
  const clearSession = () => {
    localStorage.removeItem('numberPokerSession');
  };

  const handleCreateGame = useCallback(async () => {
    if (!playerName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter your name',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    if (isCreating || isJoining) return;

    try {
      setIsCreating(true);
      const newGameId = await createGame();
      // After creating the game, join it with the returned game ID
      if (newGameId) {
        await joinGame(newGameId, playerName);
      } else {
        throw new Error('No game ID received from server');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create game';
      toast({
        title: 'Error',
        description: errorMessage,
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsCreating(false);
    }
  }, [playerName, createGame, joinGame, toast, isCreating, isJoining]);

  const handleJoinGame = useCallback(async () => {
    if (!playerName.trim() || !gameId.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter both your name and game ID',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    if (isJoining || isCreating) return;

    try {
      setIsJoining(true);
      const playerId = await joinGame(gameId, playerName);
      if (playerId) {
        storeSession(playerName, gameId, playerId);
      }
    } catch (err) {
      // Error is already handled in the context
      // Just reset the joining state
    } finally {
      setIsJoining(false);
    }
  }, [playerName, gameId, joinGame, toast, isJoining, isCreating]);

  const handleReconnect = useCallback(async () => {
    const storedSession = localStorage.getItem('numberPokerSession');
    if (!storedSession) return;

    try {
      const session = JSON.parse(storedSession);
      if (!session.playerName || !session.gameId || !session.playerId) return;

      // Check if session is not too old (24 hours)
      const sessionAge = Date.now() - session.timestamp;
      if (sessionAge > 24 * 60 * 60 * 1000) {
        clearSession();
        return;
      }

      setIsReconnecting(true);
      await joinGame(session.gameId, session.playerName, session.playerId);
      toast({
        title: 'Reconnected!',
        description: 'Successfully reconnected to your previous game',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (err) {
      console.error('Reconnection failed:', err);
      clearSession();
      toast({
        title: 'Reconnection Failed',
        description: 'Could not reconnect to previous game. Please join manually.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsReconnecting(false);
    }
  }, [joinGame, toast]);

  return (
    <Container maxW="container.md" py={10}>
      <VStack spacing={8} align="stretch">
        <Box textAlign="center">
          <Heading size="xl" mb={4}>Number Poker</Heading>
          <Text fontSize="lg" color="gray.600">
            Create a new game or join an existing one to start playing!
          </Text>
        </Box>

        {error && (
          <Box p={4} bg="red.100" color="red.700" borderRadius="md">
            {error}
          </Box>
        )}

        <Box p={6} borderWidth={1} borderRadius="lg" boxShadow="lg">
          <VStack spacing={4}>
            <FormControl isRequired>
              <FormLabel>Your Name</FormLabel>
              <Input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                isDisabled={isJoining || isCreating}
              />
            </FormControl>

            <FormControl>
              <FormLabel>Game ID (to join existing game)</FormLabel>
              <Input
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                placeholder="Enter game ID to join"
                isDisabled={isJoining || isCreating}
              />
            </FormControl>

            <Button
              colorScheme="blue"
              width="full"
              onClick={handleCreateGame}
              isDisabled={!playerName.trim() || isJoining || isCreating}
              isLoading={isCreating}
            >
              Create New Game
            </Button>

            <Button
              colorScheme="green"
              width="full"
              onClick={handleJoinGame}
              isDisabled={!playerName.trim() || !gameId.trim() || isJoining || isCreating}
              isLoading={isJoining}
            >
              Join Game
            </Button>

            {/* Reconnection button */}
            {localStorage.getItem('numberPokerSession') && (
              <Button
                colorScheme="orange"
                width="full"
                onClick={handleReconnect}
                isDisabled={isJoining || isCreating || isReconnecting}
                isLoading={isReconnecting}
              >
                Reconnect to Previous Game
              </Button>
            )}
          </VStack>
        </Box>
      </VStack>
    </Container>
  );
}; 