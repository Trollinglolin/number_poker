import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Button,
  Grid,
  Text,
  VStack,
  HStack,
  Container,
  Card,
  CardBody,
  Badge,
  Flex,
  Spacer,
  useDisclosure,
  Input,
  Stack,
  StackProps,
  useToast,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  FormControl,
  FormLabel,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  ModalFooter
} from '@chakra-ui/react';
import { useGame } from '../contexts/GameContext';
import { Card as GameCard, Player, GameAction, GameState, OperationType } from '../shared/types';
import { EquationBuilder } from './EquationBuilder';

// Extend StackProps to include spacing
interface ExtendedStackProps extends StackProps {
  spacing?: number;
}

const CardComponent: React.FC<{ 
  card: GameCard; 
  isHidden?: boolean;
  isOwner?: boolean;
}> = ({ card, isHidden, isOwner }) => {
  // Only show hidden card to its owner
  if (isHidden && !isOwner) {
    return (
      <Card bg="gray.200" w="60px" h="90px" display="flex" alignItems="center" justifyContent="center">
        <Text>?</Text>
      </Card>
    );
  }

  if (card.type === 'number') {
    return (
      <Card
        bg={card.color === 'gold' ? 'yellow.200' : 
            card.color === 'silver' ? 'gray.200' :
            card.color === 'bronze' ? 'orange.200' : 'gray.700'}
        color={card.color === 'dark' ? 'white' : 'black'}
        w="60px"
        h="90px"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Text fontSize="2xl" fontWeight="bold">{card.value}</Text>
      </Card>
    );
  }

  // Map operation symbols to their display versions
  const operationSymbols: { [key: string]: string } = {
    'add': '+',
    'subtract': '-',
    'multiply': '×',
    'divide': '÷',
    'squareRoot': '√'
  };

  return (
    <Card bg="blue.200" w="60px" h="90px" display="flex" alignItems="center" justifyContent="center">
      <Text fontSize="2xl" fontWeight="bold">{operationSymbols[card.operation]}</Text>
    </Card>
  );
};

const PlayerHand: React.FC<{ 
  player: Player; 
  isCurrentPlayer: boolean; 
  onAction: (action: GameAction) => void;
  showActions: boolean;
  currentPlayerId: string | null;
  gamePhase: string;
  game: GameState;
}> = ({
  player,
  isCurrentPlayer,
  onAction,
  showActions,
  currentPlayerId,
  gamePhase,
  game
}) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [betAmount, setBetAmount] = useState('');
  const toast = useToast();

  // Separate number cards and operation cards
  const numberCards = player.cards.filter(card => card.type === 'number');
  const operationCards = player.cards.filter(card => card.type === 'operation');

  // For other players, show all but the first number card
  const visibleNumberCards = player.id === currentPlayerId 
    ? numberCards 
    : numberCards.slice(1, 4); 

  // For other players, show all operation cards
  const visibleOperationCards = player.id === currentPlayerId 
    ? operationCards 
    : operationCards;

  // Only show betting actions during betting phases
  const isBettingPhase = gamePhase.startsWith('betting');
  const canShowActions = showActions && isBettingPhase && !player.isFolded;

  const handleBet = () => {
    const amount = parseInt(betAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: 'Invalid bet',
        description: 'Please enter a valid bet amount',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    onAction({ type: 'bet', playerId: player.id, amount });
    onClose();
  };

  return (
    <Box p={4} borderWidth={1} borderRadius="md" bg={isCurrentPlayer ? 'blue.50' : 'white'}>
      <VStack spacing={2} as={Stack} {...({ spacing: 2 } as ExtendedStackProps)}>
        <HStack>
          <Text fontWeight="bold">{player.name}</Text>
          <Badge colorScheme={player.isFolded ? 'red' : 'green'}>
            {player.isFolded ? 'Folded' : `${player.chips} chips`}
          </Badge>
          {isCurrentPlayer && (
            <Badge colorScheme="blue">Current Turn</Badge>
          )}
        </HStack>

        {/* Number Cards Row */}
        <HStack spacing={2} as={Stack} {...({ spacing: 2 } as ExtendedStackProps)}>
          {visibleNumberCards.map((card: GameCard, index: number) => (
            <CardComponent
              key={`num-${index}`}
              card={card}
              isHidden={false}
              isOwner={player.id === currentPlayerId}
            />
          ))}
          {/* Show unknown card for other players */}
          {player.id !== currentPlayerId && numberCards.length > 0 && (
            <Card bg="gray.200" w="60px" h="90px" display="flex" alignItems="center" justifyContent="center">
              <Text>?</Text>
            </Card>
          )}
        </HStack>

        {/* Operation Cards Row */}
        <HStack spacing={2} as={Stack} {...({ spacing: 2 } as ExtendedStackProps)}>
          {/* Player's initial operation cards */}
          {player.operationCards.map((card: GameCard, index: number) => (
            <CardComponent 
              key={`op-${index}`} 
              card={card} 
              isOwner={player.id === currentPlayerId}
            />
          ))}
          {/* Additional operation cards (multiply, square root) */}
          {visibleOperationCards.map((card: GameCard, index: number) => (
            <CardComponent 
              key={`add-op-${index}`} 
              card={card} 
              isOwner={player.id === currentPlayerId}
            />
          ))}
        </HStack>

        {/* Show betting actions during player's turn */}
        {canShowActions && (
          <HStack>
            <Button size="sm" onClick={() => onAction({ type: 'fold', playerId: player.id })}>
              Fold
            </Button>
            <Button size="sm" onClick={() => onAction({ type: 'call', playerId: player.id })}>
              {game.currentBet === player.bet ? 'Check' : 'Call'}
            </Button>
            <Button size="sm" onClick={onOpen}>
              Raise
            </Button>
          </HStack>
        )}
      </VStack>

      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Place Your Bet</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <FormControl>
              <FormLabel>Bet Amount</FormLabel>
              <Input
                type="number"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                placeholder="Enter bet amount"
              />
            </FormControl>
            <Button mt={4} colorScheme="blue" onClick={handleBet}>
              Place Bet
            </Button>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export const GameTable: React.FC = () => {
  const { game, playerId, performAction, startGame, swapRequest, setSwapRequest } = useGame();
  const [betAmount, setBetAmount] = useState<number>(0);
  const [isBetting, setIsBetting] = useState(false);
  const [isStartingNewRound, setIsStartingNewRound] = useState(false);
  const toast = useToast();
  const lastPhaseRef = React.useRef<string>('');
  const lastCurrentPlayerRef = React.useRef<string>('');

  // Handle card swap
  const handleCardSwap = (swapCardType: OperationType) => {
    if (!swapRequest) return;
    
    try {
      performAction({
        type: 'swapCard',
        playerId: swapRequest.playerId,
        swapCardType
      });
      
      // Clear the swap request
      setSwapRequest(null);
      
      toast({
        title: 'Card Swapped',
        description: `Successfully swapped ${swapCardType} for multiply card`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      console.error('Error swapping card:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to swap card',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  // Move handlePlaceBet outside of conditional rendering
  const handlePlaceBet = useCallback(async () => {
    if (!game || !playerId || !currentPlayer) {
      console.error('Cannot place bet: missing game, playerId, or currentPlayer');
      return;
    }

    if (betAmount <= game.currentBet) {
      toast({
        title: 'Invalid Bet',
        description: 'Bet must be higher than current bet',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    const playerChips = currentPlayer.chips;
    if (typeof playerChips !== 'number') {
      console.error('Invalid player chips value:', playerChips);
      toast({
        title: 'Error',
        description: 'Invalid player state',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    if (betAmount > playerChips) {
      toast({
        title: 'Invalid Bet',
        description: 'Not enough chips',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    try {
      setIsBetting(true);
      console.log('Placing bet:', { 
        amount: betAmount, 
        currentBet: game.currentBet,
        playerChips,
        playerId 
      });
      
      await performAction({
        type: 'bet',
        playerId,
        amount: betAmount
      });

      // Reset bet amount after placing bet
      setBetAmount(0);
    } catch (err) {
      console.error('Error placing bet:', err);
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to place bet',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsBetting(false);
    }
  }, [game, playerId, betAmount, performAction, toast]);

  // Add effect for game state changes with proper dependencies
  useEffect(() => {
    if (!game) return;

    // Only notify on phase changes if the phase actually changed
    if (game.phase !== lastPhaseRef.current) {
      lastPhaseRef.current = game.phase;
      if (game.phase !== 'waiting') {
        toast({
          title: 'Game Phase',
          description: `Phase changed to: ${game.phase}`,
          status: 'info',
          duration: 3000,
          isClosable: true,
        });
      }
    }

    // Only notify on turn changes if the current player actually changed
    if (game.currentPlayer !== lastCurrentPlayerRef.current) {
      lastCurrentPlayerRef.current = game.currentPlayer;
      const currentPlayer = game.players.find(p => p.id === game.currentPlayer);
      if (currentPlayer) {
        toast({
          title: 'Turn Change',
          description: `It's ${currentPlayer.name}'s turn`,
          status: 'info',
          duration: 2000,
          isClosable: true,
        });
      }
    }

    // Show bot actions
    if (game.lastAction && game.lastAction.playerId.startsWith('bot-')) {
      toast({
        title: 'Bot Action',
        description: `${game.lastAction.playerName} ${game.lastAction.action}`,
        status: 'info',
        duration: 2000,
        isClosable: true,
      });
    }
  }, [game, toast]);

  if (!game) return null;

  const currentPlayer = game.players.find((p: Player) => p.id === playerId);
  const activePlayer = game.players.find((p: Player) => p.id === game.currentPlayer);

  const handleAction = (action: GameAction) => {
    // Notify about the action
    const actionPlayer = game.players.find(p => p.id === action.playerId);
    if (actionPlayer) {
      let actionDescription = '';
      switch (action.type) {
        case 'bet':
          actionDescription = `bet ${action.amount} chips`;
          break;
        case 'call':
          actionDescription = 'called';
          break;
        case 'fold':
          actionDescription = 'folded';
          break;
        case 'selectBetType':
          actionDescription = `selected ${action.betType} bet`;
          break;
      }
      toast({
        title: 'Action',
        description: `${actionPlayer.name} ${actionDescription}`,
        status: 'info',
        duration: 2000,
        isClosable: true,
      });
    }
    performAction(action);
  };

  const handleStartGame = async () => {
    try {
      console.log('Starting game...', { gameId: game.id, players: game.players });
      await startGame();
      console.log('Game started successfully');
    } catch (err) {
      console.error('Error starting game:', err);
      toast({
        title: 'Error starting game',
        description: err instanceof Error ? err.message : 'Unknown error occurred',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const handleStartNewRound = async () => {
    if (!game) return;
    
    try {
      setIsStartingNewRound(true);
      console.log('Starting new round...', { gameId: game.id });
      await startGame(); // Reuse the startGame function to reset the game
      console.log('New round started successfully');
      toast({
        title: 'New Round Started',
        description: 'The game has been reset with new cards and chips',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (err) {
      console.error('Error starting new round:', err);
      toast({
        title: 'Error starting new round',
        description: err instanceof Error ? err.message : 'Unknown error occurred',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsStartingNewRound(false);
    }
  };

  return (
    <Container maxW="container.xl" py={10}>
      <VStack spacing={6} as={Stack} {...({ spacing: 6 } as ExtendedStackProps)}>
        <Box w="100%" p={4} bg="gray.100" borderRadius="md">
          <Flex direction="column" gap={2}>
            <Flex>
              <Text>Pot: {game.pot} chips</Text>
              <Spacer />
              <Text>Game ID: {game.id}</Text>
              <Spacer />
              <Text>Current Bet: {game.currentBet} chips</Text>
              <Spacer />
              <Badge colorScheme="purple">Phase: {game.phase}</Badge>
            </Flex>
            {activePlayer && (
              <Text fontWeight="bold" color={activePlayer.id === playerId ? "blue.500" : "gray.700"}>
                Current Turn: {activePlayer.name}
                {activePlayer.id === playerId && " (Your Turn)"}
              </Text>
            )}
          </Flex>
        </Box>

        {game.phase === 'waiting' && (
          <Button
            colorScheme="green"
            onClick={handleStartGame}
          >
            Start Game (Test Mode)
          </Button>
        )}

        <Grid templateColumns="repeat(2, 1fr)" gap={6} w="100%">
          {game.players.map((player: Player) => (
            <PlayerHand
              key={player.id}
              player={player}
              isCurrentPlayer={player.id === game.currentPlayer}
              onAction={handleAction}
              showActions={player.id === game.currentPlayer && player.id === playerId}
              currentPlayerId={playerId}
              gamePhase={game.phase}
              game={game}
            />
          ))}
        </Grid>

        {/* Show equation phase UI when it's the player's turn */}
        {game.phase === 'equation' && currentPlayer && !currentPlayer.isFolded && (
          <Box w="100%" p={4} borderWidth={1} borderRadius="md" bg="blue.50">
            <VStack spacing={4} as={Stack} {...({ spacing: 4 } as ExtendedStackProps)}>
              <Text fontSize="lg" fontWeight="bold">Equation Phase</Text>
              <Text>Create your equation to get as close as possible to 1 or 20</Text>
              {/* If betType not selected, show bet type buttons */}
              {!currentPlayer.betType && (
                <HStack spacing={4}>
                  <Button
                    colorScheme="blue"
                    size="lg"
                    onClick={() => handleAction({ type: 'selectBetType', playerId: currentPlayer.id, betType: 'small' })}
                  >
                    Bet Small (Close to 1)
                  </Button>
                  <Button
                    colorScheme="red"
                    size="lg"
                    onClick={() => handleAction({ type: 'selectBetType', playerId: currentPlayer.id, betType: 'big' })}
                  >
                    Bet Big (Close to 20)
                  </Button>
                  <Button
                    colorScheme="purple"
                    size="lg"
                    onClick={() => handleAction({ type: 'selectBetType', playerId: currentPlayer.id, betType: 'both' })}
                  >
                    Bet Both
                  </Button>
                </HStack>
              )}
              {/* If betType selected and not yet submitted, show equation builder */}
              {currentPlayer.betType && !currentPlayer.submittedEquations && (
                <EquationBuilder
                  betType={currentPlayer.betType}
                  cards={currentPlayer.cards}
                  operationCards={currentPlayer.operationCards}
                  onSubmit={equations => handleAction({ type: 'submitEquation', playerId: currentPlayer.id, equations })}
                />
              )}
              {/* If already submitted, show a message */}
              {currentPlayer.betType && currentPlayer.submittedEquations && (
                <Text color="green.600" fontWeight="bold">Equations submitted! Waiting for other players...</Text>
              )}
            </VStack>
          </Box>
        )}

        {game.phase === 'ended' && (
          <Box w="100%" p={4} bg="green.50" borderRadius="md">
            <VStack spacing={4} as={Stack} {...({ spacing: 4 } as ExtendedStackProps)}>
              <Text fontWeight="bold" fontSize="xl">Game Over!</Text>
              
              {/* Display winners */}
              <VStack spacing={2}>
                <Text>Small Winners: {game.winners.small.map((id: string) => game.players.find((p: Player) => p.id === id)?.name).join(', ')}</Text>
                <Text>Big Winners: {game.winners.big.map((id: string) => game.players.find((p: Player) => p.id === id)?.name).join(', ')}</Text>
              </VStack>

              {/* Display all players' equations and results */}
              {game.equationResults && game.equationResults.length > 0 && (
                <Box w="100%" mt={4}>
                  <Text fontWeight="bold" mb={2}>All Equations:</Text>
                  <VStack spacing={4} align="stretch">
                    {game.equationResults.map((result) => (
                      <Box key={result.playerId} p={3} bg="white" borderRadius="md" shadow="sm">
                        <Text fontWeight="bold">{result.playerName} ({result.betType}):</Text>
                        {result.equations.small && (
                          <Text mt={1}>
                            Small: {result.equations.small.expr} = {result.equations.small.result.toFixed(2)}
                            {result.equations.small.result === 1 ? ' 🎯' : ''}
                          </Text>
                        )}
                        {result.equations.big && (
                          <Text mt={1}>
                            Big: {result.equations.big.expr} = {result.equations.big.result.toFixed(2)}
                            {result.equations.big.result === 20 ? ' 🎯' : ''}
                          </Text>
                        )}
                      </Box>
                    ))}
                  </VStack>
                </Box>
              )}

              <Button
                colorScheme="blue"
                size="lg"
                onClick={handleStartNewRound}
                isLoading={isStartingNewRound}
                loadingText="Starting New Round..."
              >
                Start New Round
              </Button>
            </VStack>
          </Box>
        )}
      </VStack>

      {/* Betting Modal */}
      <Modal isOpen={isBetting} onClose={() => setIsBetting(false)}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Place Your Bet</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <Text>Current Bet: {game?.currentBet || 0}</Text>
              <FormControl>
                <FormLabel>Bet Amount</FormLabel>
                <NumberInput
                  min={game?.currentBet ? game.currentBet + 1 : 1}
                  max={currentPlayer?.chips || 0}
                  value={betAmount}
                  onChange={(_, value) => setBetAmount(value)}
                >
                  <NumberInputField />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button
              colorScheme="blue"
              onClick={handlePlaceBet}
              isLoading={isBetting}
              isDisabled={betAmount <= (game?.currentBet || 0) || betAmount > (currentPlayer?.chips || 0)}
            >
              Place Bet
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Card Swap Modal */}
      <Modal isOpen={!!swapRequest && swapRequest.playerId === playerId} onClose={() => setSwapRequest(null)} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Choose Card to Swap</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <Text>You received a multiply card! Choose which operation card you want to swap:</Text>
              <HStack spacing={4} wrap="wrap">
                {swapRequest?.availableCards.map((cardType) => (
                  <Button
                    key={cardType}
                    colorScheme="blue"
                    size="lg"
                    onClick={() => handleCardSwap(cardType as OperationType)}
                  >
                    {cardType === 'add' ? '+' : 
                     cardType === 'subtract' ? '-' : 
                     cardType === 'multiply' ? '×' : 
                     cardType === 'divide' ? '÷' : 
                     cardType === 'squareRoot' ? '√' : cardType}
                  </Button>
                ))}
              </HStack>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Container>
  );
}; 