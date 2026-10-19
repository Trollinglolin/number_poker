import { useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  Ack,
  ClientToServerEvents,
  Command,
  JoinResult,
  RoomView,
  ServerToClientEvents,
} from '@numberpoker/shared';

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type Status = 'idle' | 'connecting' | 'online' | 'offline';

interface Session {
  code: string;
  playerId: string;
  token: string;
  name: string;
}

export interface ClientState {
  status: Status;
  /** true once the first connect attempt has resolved */
  ready: boolean;
  view: RoomView | null;
  /** a session exists in storage and we are re-joining it */
  resuming: boolean;
  notice: string | null;
}

const SESSION_KEY = 'np.session';
const NAME_KEY = 'np.name';
const ACK_TIMEOUT = 6000;

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
function writeSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode: fine, the session just will not survive a reload */
  }
}

export const savedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
};

class GameClient {
  private socket: GameSocket | null = null;
  private session: Session | null = readSession();
  private listeners = new Set<() => void>();
  private state: ClientState = {
    status: 'idle',
    ready: false,
    view: null,
    resuming: this.session !== null,
    notice: null,
  };

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.state;

  private set(patch: Partial<ClientState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** open the socket (once) and re-join a saved table */
  start() {
    if (this.socket) return;
    this.set({ status: 'connecting' });
    const url = import.meta.env.VITE_SERVER_URL as string | undefined;
    const socket: GameSocket = url ? io(url) : io();
    this.socket = socket;

    socket.on('connect', async () => {
      this.set({ status: 'online', ready: true });
      if (this.session) await this.rejoin();
      else this.set({ resuming: false });
    });
    socket.on('disconnect', () => this.set({ status: 'offline' }));
    socket.on('connect_error', () => this.set({ status: 'offline', ready: true, resuming: false }));
    socket.on('state', (view) => this.set({ view, resuming: false }));
    socket.on('room:closed', (reason) => {
      this.forget();
      this.set({ view: null, notice: reason, resuming: false });
    });
  }

  private async rejoin() {
    const s = this.session;
    if (!s) return;
    const res = await this.emit<JoinResult>('room:join', { code: s.code, name: s.name, playerId: s.playerId, token: s.token });
    if (!res.ok) {
      this.forget();
      this.set({ view: null, resuming: false, notice: 'That table is no longer available.' });
    }
  }

  private emit<T extends object = object>(event: 'room:create' | 'room:join', payload: object): Promise<Ack<T>> {
    return new Promise((resolve) => {
      const socket = this.socket;
      if (!socket?.connected) return resolve({ ok: false, error: 'You are offline. Reconnecting…' });
      (socket.timeout(ACK_TIMEOUT) as any).emit(event, payload, (err: unknown, res: Ack<T>) =>
        resolve(err ? { ok: false, error: 'The server did not answer. Try again.' } : res),
      );
    });
  }

  private remember(name: string, r: JoinResult) {
    this.session = { code: r.code, playerId: r.playerId, token: r.token, name };
    writeSession(this.session);
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch {
      /* ignore */
    }
  }

  private forget() {
    this.session = null;
    writeSession(null);
  }

  async create(name: string): Promise<Ack<JoinResult>> {
    const res = await this.emit<JoinResult>('room:create', { name });
    if (res.ok) {
      this.remember(name, res);
      this.set({ notice: null });
    }
    return res;
  }

  async join(code: string, name: string): Promise<Ack<JoinResult>> {
    const res = await this.emit<JoinResult>('room:join', { code, name });
    if (res.ok) {
      this.remember(name, res);
      this.set({ notice: null });
    }
    return res;
  }

  command(cmd: Command): Promise<Ack> {
    return new Promise((resolve) => {
      const socket = this.socket;
      if (!socket?.connected) return resolve({ ok: false, error: 'You are offline. Reconnecting…' });
      (socket.timeout(ACK_TIMEOUT) as any).emit('room:command', cmd, (err: unknown, res: Ack) =>
        resolve(err ? { ok: false, error: 'The server did not answer. Try again.' } : res),
      );
    });
  }

  async leave() {
    await this.command({ type: 'leave' });
    this.forget();
    this.set({ view: null, notice: null });
  }

  dismissNotice() {
    this.set({ notice: null });
  }
}

export const game = new GameClient();

export function useGame(): ClientState {
  return useSyncExternalStore(game.subscribe, game.getSnapshot, game.getSnapshot);
}
