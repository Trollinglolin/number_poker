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
  const toast = useToast();

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
      await joinGame(gameId, playerName);
    } catch (err) {
      // Error is already handled in the context
      // Just reset the joining state
    } finally {
      setIsJoining(false);
    }
  }, [playerName, gameId, joinGame, toast, isJoining, isCreating]);

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
          </VStack>
        </Box>
      </VStack>
    </Container>
  );
}; 