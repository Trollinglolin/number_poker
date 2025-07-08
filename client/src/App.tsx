import React from 'react';
import { ChakraProvider, extendTheme } from '@chakra-ui/react';
import { GameProvider } from './contexts/GameContext';
import { GameLobby } from './components/GameLobby';
import { GameTable } from './components/GameTable';
import { useGame } from './contexts/GameContext';

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
