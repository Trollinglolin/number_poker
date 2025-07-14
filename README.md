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

## Features

- Real-time multiplayer gameplay using Socket.IO
- Mathematical equation building with cards
- Betting system with chips
- Bot players for single-player testing
- Modern React UI with Chakra UI
- Single-port deployment for easy sharing

## Development Setup

### Prerequisites

- Node.js (v14 or higher)
- npm

### Installation

1. Clone the repository
2. Install all dependencies:
   ```bash
   npm run install-all
   ```

### Development Mode

Start both client and server in development mode:
```bash
npm start
```

This will start:
- Client on http://localhost:3000
- Server on http://localhost:3001

### Individual Commands

- **Client only**: `cd client && npm start`
- **Server only**: `cd server && npm run dev`

## Production Deployment

### Build for Production

Build both client and server:
```bash
npm run build
```

### Start Production Server

Start the production server (serves both API and React app):
```bash
npm run start-prod
```

The server will run on port 3001 and serve:
- API endpoints at `/api/*`
- React app at all other routes

### Using with ngrok

1. Build the project: `npm run build`
2. Start production server: `npm run start-prod`
3. Start ngrok: `ngrok http 3001`
4. Share the ngrok URL with others to play

## How to Play

1. Open your browser and navigate to the game URL
2. Enter your name and either:
   - Create a new game (you'll get a game ID to share with other players)
   - Join an existing game (enter the game ID shared by another player)
3. Wait for at least 2 players to join
4. Click "Start Game" to begin
5. Follow the betting rounds and create your equations
6. Choose whether to bet on getting close to 1 (small), 20 (big), or both
7. The winners are determined by who gets closest to their target numbers

## Game Phases

1. **Waiting** - Players join the game
2. **Dealing 1** - First two cards dealt to each player
3. **Betting 1** - Initial betting round after first two cards
4. **Dealing 2** - Additional two cards dealt (total of 4 cards)
5. **Betting 2** - Second betting round after all cards are dealt
6. **Equation** - Players create and submit their mathematical equations
7. **Final** - Winners are determined and chips are distributed
8. **Ended** - Game is complete

## Game Flow Logic

### Card Dealing
- Players start with 3 operation cards: add (+), subtract (-), and divide (/)
- During dealing, if a multiply card is drawn, players can choose to swap one of their operation cards
- Players receive exactly 4 number cards total

### Betting Rounds
- Follows Texas Hold'em betting rules
- Players can bet, call, raise, or fold
- All active players must match the current bet to continue

### Equation Building
- Players use all 4 number cards and their operation cards
- Target values: 1 (small) and 20 (big)
- Players can bet on small, big, or both
- Equations are evaluated mathematically

### Scoring System
- Closest to target value wins
- Color-based tiebreaker: gold > silver > bronze > dark
- Winners receive chips from the pot

## Technology Stack

- **Frontend**: React with TypeScript, Chakra UI, Socket.IO Client
- **Backend**: Node.js with Express, Socket.IO, TypeScript
- **Build Tools**: Create React App, TypeScript Compiler
- **Real-time Communication**: Socket.IO for live game updates

## Project Structure

```
├── client/          # React frontend application
├── server/          # Node.js backend server
├── shared/          # Shared TypeScript types and utilities
├── package.json     # Root package configuration
└── README.md        # This file
```

## Development

- Frontend development server runs on `http://localhost:3000`
- Backend server runs on `http://localhost:3001`
- The frontend will automatically reload when you make changes
- The backend will automatically restart when you make changes
- Production mode serves both frontend and backend on a single port

## API Endpoints

- `POST /api/games` - Create a new game
- `GET /api/games/:id` - Get game state
- `POST /api/games/:id/join` - Join a game
- `POST /api/games/:id/start` - Start a game
- `POST /api/games/:id/action` - Perform a game action

## Socket.IO Events

- `joinGame` - Join a game room
- `gameAction` - Perform game actions (bet, call, fold, etc.)
- `gameUpdate` - Receive game state updates
- `requireSwap` - Handle card swap requests
- `error` - Handle error messages 


## Issues Remained to be Fixed
- Add a betting round before the first dealing phase
- When player run out of chips, should be eliminated from the game
- When player disconnected, should leave the game room
- Fix the bet both function
- Player should not be able to bet higher than lowest-chip players amount
- Add reconnection functionality
- When a game is started, new players should be able to join and spectate until next round starts

