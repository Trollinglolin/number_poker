// src/App.tsx
import React, { useEffect, useState } from 'react';
import { ChakraProvider, extendTheme, Spinner, Box } from '@chakra-ui/react';
import { GameProvider } from './contexts/GameContext';
import { GameLobby } from './components/GameLobby';
import { GameTable } from './components/GameTable';
import { useGame } from './contexts/GameContext';
import { getDiscordSdk, setupDiscordSdk } from './discord';

// Extend the theme to include custom colors, fonts, etc
const customTheme = extendTheme({
  components: {
    Card: {
      baseStyle: {
        container: {
          borderRadius: 'md',
          boxShadow: 'md',
        },
      },
    },
  },
});

function App() {
  const [isDiscordReady, setIsDiscordReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setupDiscordSdk()
      .then(() => {
        console.log('Discord SDK initialized successfully');
        setIsDiscordReady(true);
      })
      .catch((err) => {
        console.error('Failed to initialize Discord SDK:', err);
        setError('Failed to connect to Discord. Please try refreshing the page.');
      });
  }, []);

  if (error) {
    return (
      <Box p={4} color="red.500" textAlign="center">
        {error}
      </Box>
    );
  }

  if (!isDiscordReady) {
    return (
      <ChakraProvider theme={customTheme}>
        <Box display="flex" justifyContent="center" alignItems="center" minH="100vh">
          <Spinner size="xl" />
        </Box>
      </ChakraProvider>
    );
  }

  return (
    <ChakraProvider theme={customTheme}>
      <GameProvider>
        <GameContent />
      </GameProvider>
    </ChakraProvider>
  );
}

const GameContent: React.FC = () => {
  const { game } = useGame();
  return game ? <GameTable /> : <GameLobby />;
};

export default App;
