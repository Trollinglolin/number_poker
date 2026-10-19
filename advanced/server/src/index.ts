import { createServer } from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';
import { Server } from 'socket.io';
import { GameError } from '@numberpoker/shared';
import type { ClientToServerEvents, ServerToClientEvents } from '@numberpoker/shared';
import { config } from './config';
import { log } from './log';
import { RoomManager } from './rooms';
import { commandSchema, createSchema, joinSchema } from './schemas';

interface SocketData {
  code?: string;
  playerId?: string;
  /** token bucket for incoming events */
  tokens: number;
  refilledAt: number;
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const http = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(http, {
  // same-origin in production; dev (vite on another port) and explicit origins are allowed
  cors: config.corsOrigins.length ? { origin: config.corsOrigins } : config.isProd ? undefined : { origin: true },
  maxHttpBufferSize: 16 * 1024,
  pingInterval: 20_000,
  pingTimeout: 20_000,
});

const manager = new RoomManager(config, {
  emit: (socketId, event, payload) => {
    io.to(socketId).emit(event as 'state', payload as never);
  },
});

/* ------------------------------------------------------------------ http */

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; frame-ancestors 'none'; base-uri 'self'",
  );
  next();
});

app.get('/healthz', (_req, res) => {
  res.json({ ok: true, rooms: manager.roomCount, connections: manager.connectionCount, uptime: Math.round(process.uptime()) });
});

if (existsSync(path.join(config.webDist, 'index.html'))) {
  // hashed assets never change, so they can be cached for a year; the shell must always revalidate
  app.use(
    '/assets',
    express.static(path.join(config.webDist, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }),
  );
  app.use(express.static(config.webDist, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!socket\.io|healthz).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    // `root` keeps the dotfile check relative to the web folder, wherever it is deployed
    res.sendFile('index.html', { root: config.webDist });
  });
} else {
  app.get('/', (_req, res) => {
    res.type('text/plain').send('Number Poker server is running. Build the web app (npm run build) to serve it from here.');
  });
}

/* --------------------------------------------------------------- sockets */

const BUCKET_SIZE = 30;
const REFILL_PER_SEC = 6;

function allow(data: SocketData): boolean {
  const now = Date.now();
  data.tokens = Math.min(BUCKET_SIZE, data.tokens + ((now - data.refilledAt) / 1000) * REFILL_PER_SEC);
  data.refilledAt = now;
  if (data.tokens < 1) return false;
  data.tokens -= 1;
  return true;
}

type Ack = (r: { ok: true } | { ok: false; error: string }) => void;

function fail(ack: unknown, e: unknown) {
  let error = 'Something went wrong. Please try again.';
  if (e instanceof GameError) error = e.message;
  else if (e && typeof e === 'object' && 'issues' in e) error = 'That request was not valid.';
  else log('error', 'unhandled', { err: String(e) });
  if (typeof ack === 'function') (ack as Ack)({ ok: false, error });
}

io.on('connection', (socket) => {
  socket.data.tokens = BUCKET_SIZE;
  socket.data.refilledAt = Date.now();

  const bind = (code: string, playerId: string) => {
    if (socket.data.code && socket.data.playerId) manager.detach(socket.id);
    socket.data.code = code;
    socket.data.playerId = playerId;
    manager.attach(code, playerId, socket.id);
  };

  socket.on('room:create', (payload, ack) => {
    try {
      if (!allow(socket.data)) throw new GameError('Slow down a little.');
      const { name } = createSchema.parse(payload);
      const res = manager.create(name);
      bind(res.code, res.playerId);
      ack?.({ ok: true, ...res });
    } catch (e) {
      fail(ack, e);
    }
  });

  socket.on('room:join', (payload, ack) => {
    try {
      if (!allow(socket.data)) throw new GameError('Slow down a little.');
      const p = joinSchema.parse(payload);
      const res = manager.join(p.code, p.name, { playerId: p.playerId, token: p.token });
      bind(res.code, res.playerId);
      ack?.({ ok: true, ...res });
    } catch (e) {
      fail(ack, e);
    }
  });

  socket.on('room:command', (payload, ack) => {
    try {
      if (!allow(socket.data)) throw new GameError('Slow down a little.');
      const { code, playerId } = socket.data;
      if (!code || !playerId) throw new GameError('Join a table first.');
      const cmd = commandSchema.parse(payload);
      manager.command(code, playerId, cmd);
      if (cmd.type === 'leave') {
        manager.detach(socket.id);
        socket.data.code = undefined;
        socket.data.playerId = undefined;
      }
      ack?.({ ok: true });
    } catch (e) {
      fail(ack, e);
    }
  });

  socket.on('disconnect', () => manager.detach(socket.id));
});

/* ------------------------------------------------------------- lifecycle */

const sweeper = setInterval(() => manager.sweep(), 2000);
sweeper.unref();

http.listen(config.port, () => {
  log('info', 'server listening', { port: config.port, env: config.isProd ? 'production' : 'development' });
});

let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log('info', 'shutting down', { signal });
  clearInterval(sweeper);
  manager.closeAll('The server is restarting. Please rejoin in a moment.');
  io.close(() => http.close(() => process.exit(0)));
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
