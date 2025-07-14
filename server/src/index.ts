import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import createGameRoutes from './routes/gameRoutes';
import { GameService } from './services/gameService';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Create a single instance of GameService
const gameService = new GameService();
gameService.setSocketIO(io);

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../../../client/build')));
}

// Initialize routes with the game service instance
app.use('/api/games', createGameRoutes(gameService));

// Socket.IO setup
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('joinGame', ({ gameId, playerId }) => {
    console.log('Client joining game room:', { socketId: socket.id, gameId, playerId });
    
    const game = gameService.getGame(gameId);
    if (!game) {
      console.error('Game not found for joining player:', gameId);
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    // Join the game room
    socket.join(gameId);
    
    // Also join a personal room for this player if playerId is provided
    if (playerId) {
      socket.join(playerId);
      console.log('Client joined personal room:', playerId);
    }
    
    console.log('Client joined game room:', gameId);
    socket.emit('gameUpdate', game);
  });

  socket.on('gameAction', ({ gameId, action }) => {
    console.log('Received game action:', { socketId: socket.id, gameId, action });
    try {
      const game = gameService.getGame(gameId);
      if (!game) {
        throw new Error('Game not found');
      }

      gameService.performAction(gameId, action);
    } catch (error) {
      console.error('Error handling game action:', error);
      socket.emit('error', { 
        message: error instanceof Error ? error.message : 'Failed to perform action'
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Serve React app for all non-API routes in production (must be after API routes)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../../../client/build/index.html'));
  });
}

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  if (process.env.NODE_ENV === 'production') {
    console.log('Serving React app from /client/build');
  }
}); 