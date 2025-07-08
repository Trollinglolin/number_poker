import React, { useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  useToast,
  Card,
} from '@chakra-ui/react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card as GameCard } from '../shared/types';

interface EquationBuilderProps {
  betType: 'small' | 'big' | 'both';
  cards: GameCard[];
  operationCards: GameCard[];
  onSubmit: (equations: { small?: string; big?: string }) => void;
}

interface CardSlot {
  id: string;
  card: GameCard | null;
}

interface SortableCardProps {
  id: string;
  card: GameCard | null;
  index: number;
  onRemove?: () => void;
}

const SortableCard: React.FC<SortableCardProps> = ({ id, card, index, onRemove }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
    cursor: onRemove ? 'pointer' : 'grab',
  };

  if (!card) {
    return (
      <Box ref={setNodeRef} style={style} {...attributes} {...listeners}>
        <Card
          bg="gray.100"
          w="60px"
          h="90px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          border="2px dashed"
          borderColor="gray.300"
        >
          <Text color="gray.400">Drop</Text>
        </Card>
      </Box>
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    if (onRemove) {
      e.preventDefault();
      onRemove();
    }
  };

  if (card.type === 'number') {
    return (
      <Box 
        ref={setNodeRef} 
        style={style} 
        {...attributes} 
        {...listeners}
        onClick={handleClick}
        title={onRemove ? "Click to remove card" : undefined}
      >
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
          _hover={onRemove ? { transform: 'scale(1.05)', transition: 'transform 0.2s' } : undefined}
        >
          <Text fontSize="2xl" fontWeight="bold">{card.value}</Text>
        </Card>
      </Box>
    );
  }

  const operationSymbols: { [key: string]: string } = {
    'add': '+',
    'subtract': '-',
    'multiply': '×',
    'divide': '÷',
    'squareRoot': '√'
  };

  return (
    <Box 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...listeners}
      onClick={handleClick}
      title={onRemove ? "Click to remove card" : undefined}
    >
      <Card 
        bg="blue.200" 
        w="60px" 
        h="90px" 
        display="flex" 
        alignItems="center" 
        justifyContent="center"
        _hover={onRemove ? { transform: 'scale(1.05)', transition: 'transform 0.2s' } : undefined}
      >
        <Text fontSize="2xl" fontWeight="bold">{operationSymbols[card.operation]}</Text>
      </Card>
    </Box>
  );
};

const calculateEquationResult = (slots: CardSlot[]): number | null => {
  // First, convert slots to tokens with proper grouping for square root
  const tokens: Array<{ type: 'number' | 'operator' | 'sqrt', value: string }> = [];
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
          value: `Math.sqrt(${nextSlot.card.value})` 
        });
        i++; // Skip the next number since we've included it in the sqrt
      } else {
        return null; // Invalid: square root without a number
      }
    } else {
      tokens.push({ 
        type: 'operator', 
        value: slot.card.operation === 'multiply' ? '*' :
               slot.card.operation === 'divide' ? '/' :
               slot.card.operation === 'add' ? '+' :
               slot.card.operation === 'subtract' ? '-' : ''
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

export const EquationBuilder: React.FC<EquationBuilderProps> = ({
  betType,
  cards,
  operationCards,
  onSubmit,
}) => {
  const [smallSlots, setSmallSlots] = useState<CardSlot[]>([]);
  const [bigSlots, setBigSlots] = useState<CardSlot[]>([]);
  const [availableCards, setAvailableCards] = useState<GameCard[]>([...cards, ...operationCards]);
  const toast = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Add a small drag threshold to prevent accidental drags
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const smallEquationResult = React.useMemo(() => 
    calculateEquationResult(smallSlots), [smallSlots]);
  const bigEquationResult = React.useMemo(() => 
    calculateEquationResult(bigSlots), [bigSlots]);

  // Initialize slots when component mounts or when betType changes
  React.useEffect(() => {
    const totalCards = cards.length + operationCards.length;
    const emptySlots = Array.from({ length: totalCards }, (_, i) => ({
      id: `slot-${i}`,
      card: null,
    }));

    if (betType === 'small' || betType === 'both') {
      setSmallSlots(emptySlots.map(slot => ({ ...slot, id: `small-${slot.id}` })));
    }
    if (betType === 'big' || betType === 'both') {
      setBigSlots(emptySlots.map(slot => ({ ...slot, id: `big-${slot.id}` })));
    }
  }, [betType, cards.length, operationCards.length]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Only handle dragging from available cards to equation slots
    if (activeId.startsWith('card-')) {
      const cardIndex = parseInt(activeId.split('-')[1]);
      const card = availableCards[cardIndex];
      
      // Only allow dropping into equation slots
      if (overId === 'available-cards') {
        return;
      }

      // Determine which equation slot we're dropping into
      let targetSlots: CardSlot[];
      let setTargetSlots: React.Dispatch<React.SetStateAction<CardSlot[]>>;
      
      if (overId.startsWith('small-')) {
        targetSlots = smallSlots;
        setTargetSlots = setSmallSlots;
      } else if (overId.startsWith('big-')) {
        targetSlots = bigSlots;
        setTargetSlots = setBigSlots;
      } else {
        return; // Not dropping into a valid slot
      }

      // Remove card from available cards
      const newAvailableCards = [...availableCards];
      newAvailableCards.splice(cardIndex, 1);
      setAvailableCards(newAvailableCards);

      // Add card to target slot
      const slotIndex = parseInt(overId.split('-')[2]);
      const newSlots = [...targetSlots];
      newSlots[slotIndex] = { ...newSlots[slotIndex], card };
      setTargetSlots(newSlots);
    }
  };

  // Add function to handle card removal
  const handleRemoveCard = (slotId: string) => {
    const isSmall = slotId.startsWith('small-');
    const slots = isSmall ? smallSlots : bigSlots;
    const setSlots = isSmall ? setSmallSlots : setBigSlots;
    const slotIndex = parseInt(slotId.split('-')[2]);
    const card = slots[slotIndex].card;

    if (card) {
      // Add card back to available cards
      setAvailableCards([...availableCards, card]);
      
      // Remove card from slot
      const newSlots = [...slots];
      newSlots[slotIndex] = { ...newSlots[slotIndex], card: null };
      setSlots(newSlots);
    }
  };

  const buildEquation = (slots: CardSlot[]): string | null => {
    const equation = slots
      .filter(slot => slot.card !== null)
      .map(slot => {
        if (!slot.card) return '';
        if (slot.card.type === 'number') return slot.card.value.toString();
        return slot.card.operation === 'multiply' ? '*' :
               slot.card.operation === 'divide' ? '/' :
               slot.card.operation === 'add' ? '+' :
               slot.card.operation === 'subtract' ? '-' :
               slot.card.operation === 'squareRoot' ? 'Math.sqrt' : '';
      })
      .join('');

    return equation || null;
  };

  const handleSubmit = () => {
    const equations: { small?: string; big?: string } = {};

    if (betType === 'small' || betType === 'both') {
      const smallEquation = buildEquation(smallSlots);
      if (!smallEquation) {
        toast({
          title: 'Invalid Equation',
          description: 'Please build a complete equation for the small bet',
          status: 'error',
          duration: 3000,
          isClosable: true,
        });
        return;
      }
      if (smallEquationResult === null) {
        toast({
          title: 'Invalid Equation',
          description: 'The small equation results in an invalid number',
          status: 'error',
          duration: 3000,
          isClosable: true,
        });
        return;
      }
      equations.small = smallEquation;
    }

    if (betType === 'big' || betType === 'both') {
      const bigEquation = buildEquation(bigSlots);
      if (!bigEquation) {
        toast({
          title: 'Invalid Equation',
          description: 'Please build a complete equation for the big bet',
          status: 'error',
          duration: 3000,
          isClosable: true,
        });
        return;
      }
      if (bigEquationResult === null) {
        toast({
          title: 'Invalid Equation',
          description: 'The big equation results in an invalid number',
          status: 'error',
          duration: 3000,
          isClosable: true,
        });
        return;
      }
      equations.big = bigEquation;
    }

    onSubmit(equations);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <VStack spacing={6} align="stretch" w="100%">
        {/* Available Cards */}
        <Box>
          <Text fontWeight="bold" mb={2}>Available Cards</Text>
          <Box
            id="available-cards"
            p={2}
            bg="gray.50"
            borderRadius="md"
            minH="100px"
            border="2px dashed"
            borderColor="gray.300"
          >
            <HStack spacing={2}>
              <SortableContext
                items={availableCards.map((_, index) => `card-${index}`)}
                strategy={horizontalListSortingStrategy}
              >
                {availableCards.map((card, index) => (
                  <SortableCard
                    key={`card-${index}`}
                    id={`card-${index}`}
                    card={card}
                    index={index}
                  />
                ))}
              </SortableContext>
            </HStack>
          </Box>
        </Box>

        {/* Small Equation */}
        {(betType === 'small' || betType === 'both') && (
          <Box>
            <HStack justify="space-between" mb={2}>
              <Text fontWeight="bold">Small Equation (Target: 1)</Text>
              {smallEquationResult !== null && (
                <Text
                  color={Math.abs(smallEquationResult - 1) < 0.0001 ? 'green.500' : 'red.500'}
                  fontWeight="bold"
                >
                  Result: {smallEquationResult.toFixed(4)}
                </Text>
              )}
            </HStack>
            <Box
              p={2}
              bg="blue.50"
              borderRadius="md"
              minH="100px"
            >
              <HStack spacing={2}>
                <SortableContext
                  items={smallSlots.map(slot => slot.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  {smallSlots.map((slot, index) => (
                    <SortableCard
                      key={slot.id}
                      id={slot.id}
                      card={slot.card}
                      index={index}
                      onRemove={slot.card ? () => handleRemoveCard(slot.id) : undefined}
                    />
                  ))}
                </SortableContext>
              </HStack>
            </Box>
          </Box>
        )}

        {/* Big Equation */}
        {(betType === 'big' || betType === 'both') && (
          <Box>
            <HStack justify="space-between" mb={2}>
              <Text fontWeight="bold">Big Equation (Target: 20)</Text>
              {bigEquationResult !== null && (
                <Text
                  color={Math.abs(bigEquationResult - 20) < 0.0001 ? 'green.500' : 'red.500'}
                  fontWeight="bold"
                >
                  Result: {bigEquationResult.toFixed(4)}
                </Text>
              )}
            </HStack>
            <Box
              p={2}
              bg="red.50"
              borderRadius="md"
              minH="100px"
            >
              <HStack spacing={2}>
                <SortableContext
                  items={bigSlots.map(slot => slot.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  {bigSlots.map((slot, index) => (
                    <SortableCard
                      key={slot.id}
                      id={slot.id}
                      card={slot.card}
                      index={index}
                      onRemove={slot.card ? () => handleRemoveCard(slot.id) : undefined}
                    />
                  ))}
                </SortableContext>
              </HStack>
            </Box>
          </Box>
        )}

        <Button
          colorScheme="teal"
          onClick={handleSubmit}
          isDisabled={availableCards.length > 0}
        >
          Submit Equation{betType === 'both' ? 's' : ''}
        </Button>
      </VStack>
    </DndContext>
  );
}; 