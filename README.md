# Number Poker

A mathematical card game that combines poker mechanics with arithmetic operations. Players use numbered cards and operation cards to create equations, competing to get as close as possible to either 1 or 20.

## Game Rules

- The deck contains 4 sets of cards numbered 1-10 (gold, silver, bronze, and dark colored)
- Special cards: 4 division notation cards and 4 square root notation cards
- Each player starts with add, minus, and multiply notation cards
- Players receive 4 cards per round
- Three betting rounds following Texas Hold'em rules
- Players create mathematical equations to get as close as possible to either 1 or 20
- Players can bet on "small" (close to 1), "big" (close to 20), or both
- Color-based tiebreaker system (gold > silver > bronze > dark)

## Setup Instructions

1. Install dependencies:
   ```bash
   # Install root dependencies
   npm install

   # Install server dependencies
   cd server && npm install

   # Install client dependencies
   cd ../client && npm install
   ```

2. Start the development servers:
   ```bash
   # From the root directory
   ./start.sh
   ```

This will start both the backend server (on port 3001) and frontend development server (on port 3000).

## How to Play

1. Open your browser and navigate to `http://localhost:3000`
2. Enter your name and either:
   - Create a new game (you'll get a game ID to share with other players)
   - Join an existing game (enter the game ID shared by another player)
3. Wait for at least 2 players to join
4. Click "Start Game" to begin
5. Follow the betting rounds and create your equations
6. Choose whether to bet on getting close to 1 (small), 20 (big), or both
7. The winners are determined by who gets closest to their target numbers

## Technology Stack

- Frontend: React with TypeScript
- Backend: Node.js with Express
- Real-time communication: Socket.IO
- UI Framework: Chakra UI

## Project Structure

- `/client` - React frontend application
- `/server` - Node.js backend server
- `/shared` - Shared types and utilities

## Development

- Frontend development server runs on `http://localhost:3000`
- Backend server runs on `http://localhost:3001`
- The frontend will automatically reload when you make changes
- The backend will automatically restart when you make changes

## Game Phases

1. Waiting - Players join the game
2. Betting 1 - Initial betting round
3. Dealing 1 - First two cards dealt
4. Betting 2 - Second betting round
5. Dealing 2 - Last two cards dealt
8. Equation - Players create and submit their equations
9. Final - Winners are determined and chips are distributed
10. Ended - Game is complete 
