import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  GameError,
  MAX_PLAYERS,
  NAME_MAX,
  act,
  addPlayer,
  addSpectator,
  botAction,
  buildView,
  createRoom,
  forceAct,
  isBlocking,
  removePlayer,
  resetMatch,
  startHand,
} from '@numberpoker/shared';
import type { Command, Credentials, JoinResult, Room, RoomView } from '@numberpoker/shared';
import { log } from './log';

export interface Transport {
  emit(socketId: string, event: 'state', payload: RoomView): void;
  emit(socketId: string, event: 'room:closed', payload: string): void;
}

export interface ManagerOptions {
  maxRooms: number;
  roomTtlMs: number;
  afkGraceMs: number;
  emptyRoomMs: number;
  botDelayMs: number;
  now?: () => number;
  rng?: () => number;
}

interface Entry {
  room: Room;
  tokens: Map<string, string>;
  /** playerId -> live socket ids */
  sockets: Map<string, Set<string>>;
  /** playerId -> when they dropped off */
  away: Map<string, number>;
  lastActive: number;
  /** last moment any human was connected */
  lastPresent: number;
  botTimer: ReturnType<typeof setTimeout> | null;
}

const BOT_NAMES = ['Pip', 'Juno', 'Otto', 'Sable', 'Wren', 'Fig', 'Moss', 'Tilly'];

export function cleanName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const name = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  if (!name) throw new GameError('Please enter a name.');
  return name;
}

export class RoomManager {
  private rooms = new Map<string, Entry>();
  private socketIndex = new Map<string, { code: string; playerId: string }>();
  private now: () => number;
  private rng: () => number;

  constructor(
    private opts: ManagerOptions,
    private transport: Transport,
  ) {
    this.now = opts.now ?? Date.now;
    this.rng = opts.rng ?? Math.random;
  }

  get roomCount() {
    return this.rooms.size;
  }

  get connectionCount() {
    return this.socketIndex.size;
  }

  /* ------------------------------------------------------------ lifecycle */

  create(rawName: string): JoinResult {
    if (this.rooms.size >= this.opts.maxRooms) throw new GameError('The server is busy. Try again in a few minutes.');
    const name = cleanName(rawName);
    const code = this.newCode();
    const playerId = randomUUID();
    const room = createRoom(code, { id: playerId, name }, this.rng);
    const entry: Entry = {
      room,
      tokens: new Map([[playerId, newToken()]]),
      sockets: new Map(),
      away: new Map(),
      lastActive: this.now(),
      lastPresent: this.now(),
      botTimer: null,
    };
    // nobody is attached yet, so mark the host as away until their socket attaches
    room.seats[0].connected = false;
    this.rooms.set(code, entry);
    log('info', 'room created', { code });
    return { code, playerId, token: entry.tokens.get(playerId)!, spectator: false };
  }

  join(rawCode: string, rawName: string, creds?: Partial<Credentials>): JoinResult {
    const entry = this.entry(rawCode);
    const { room } = entry;
    if (creds?.playerId && creds.token && this.tokenOk(entry, creds.playerId, creds.token)) {
      const spectator = !room.seats.some((s) => s.id === creds.playerId);
      return { code: room.code, playerId: creds.playerId, token: creds.token, spectator };
    }
    const name = this.uniqueName(room, cleanName(rawName));
    const playerId = randomUUID();
    const token = newToken();
    let spectator = false;
    if (room.phase === 'waiting') {
      addPlayer(room, playerId, name);
      room.seats[room.seats.length - 1].connected = false;
    } else {
      addSpectator(room, playerId, name);
      room.spectators[room.spectators.length - 1].connected = false;
      spectator = true;
    }
    entry.tokens.set(playerId, token);
    this.changed(entry);
    return { code: room.code, playerId, token, spectator };
  }

  /** bind a live socket to a seat; the first state push follows */
  attach(code: string, playerId: string, socketId: string) {
    const entry = this.entry(code);
    let set = entry.sockets.get(playerId);
    if (!set) entry.sockets.set(playerId, (set = new Set()));
    set.add(socketId);
    this.socketIndex.set(socketId, { code: entry.room.code, playerId });
    entry.away.delete(playerId);
    this.setConnected(entry, playerId, true);
    entry.lastPresent = this.now();
    this.changed(entry);
  }

  detach(socketId: string) {
    const ref = this.socketIndex.get(socketId);
    if (!ref) return;
    this.socketIndex.delete(socketId);
    const entry = this.rooms.get(ref.code);
    if (!entry) return;
    const set = entry.sockets.get(ref.playerId);
    set?.delete(socketId);
    if (!set || set.size === 0) {
      entry.sockets.delete(ref.playerId);
      entry.away.set(ref.playerId, this.now());
      this.setConnected(entry, ref.playerId, false);
      this.changed(entry);
    }
  }

  /* -------------------------------------------------------------- commands */

  command(code: string, playerId: string, cmd: Command) {
    const entry = this.entry(code);
    const { room } = entry;
    const seat = room.seats.find((s) => s.id === playerId);
    const isHost = room.hostId === playerId;

    switch (cmd.type) {
      case 'start':
        if (!seat) throw new GameError('Spectators cannot deal.');
        if (room.phase === 'waiting' && !isHost) throw new GameError('Only the host can start the game.');
        startHand(room);
        break;
      case 'addBot': {
        if (!isHost) throw new GameError('Only the host can add a bot.');
        if (room.phase !== 'waiting') throw new GameError('Bots can only join before the game starts.');
        if (room.seats.length >= MAX_PLAYERS) throw new GameError('This table is full.');
        const taken = new Set(room.seats.map((s) => s.name));
        const pick = BOT_NAMES.find((n) => !taken.has(`${n} (bot)`)) ?? `Bot ${room.seats.length}`;
        addPlayer(room, `bot-${randomUUID().slice(0, 8)}`, `${pick} (bot)`, true);
        break;
      }
      case 'kick': {
        if (!isHost) throw new GameError('Only the host can remove players.');
        if (room.phase !== 'waiting') throw new GameError('Players can only be removed before the game starts.');
        if (cmd.playerId === playerId) throw new GameError('Use leave to leave the table.');
        this.evict(entry, cmd.playerId, 'You were removed from the table.');
        break;
      }
      case 'leave':
        this.leave(entry, playerId);
        return;
      case 'reset':
        if (!isHost) throw new GameError('Only the host can reset the match.');
        resetMatch(room);
        break;
      default:
        act(room, playerId, cmd);
    }
    entry.lastActive = this.now();
    this.changed(entry);
  }

  private leave(entry: Entry, playerId: string) {
    this.evict(entry, playerId, 'You left the table.');
    const humans = entry.room.seats.some((s) => !s.isBot) || entry.room.spectators.length > 0;
    if (!humans) this.close(entry, 'Everyone left.');
  }

  /** remove someone from the room entirely */
  private evict(entry: Entry, playerId: string, reason: string) {
    const sockets = entry.sockets.get(playerId);
    this.setConnected(entry, playerId, false);
    removePlayer(entry.room, playerId);
    entry.tokens.delete(playerId);
    entry.away.delete(playerId);
    entry.sockets.delete(playerId);
    for (const id of sockets ?? []) {
      this.socketIndex.delete(id);
      this.transport.emit(id, 'room:closed', reason);
    }
    if (this.rooms.has(entry.room.code)) this.changed(entry);
  }

  private close(entry: Entry, reason: string) {
    if (entry.botTimer) clearTimeout(entry.botTimer);
    for (const set of entry.sockets.values()) {
      for (const id of set) {
        this.socketIndex.delete(id);
        this.transport.emit(id, 'room:closed', reason);
      }
    }
    this.rooms.delete(entry.room.code);
    log('info', 'room closed', { code: entry.room.code, reason });
  }

  closeAll(reason: string) {
    for (const entry of [...this.rooms.values()]) this.close(entry, reason);
  }

  /* ----------------------------------------------------------------- sweep */

  /** call every few seconds: fold out absent players, hand over the host, drop idle rooms */
  sweep() {
    const now = this.now();
    for (const entry of [...this.rooms.values()]) {
      const { room } = entry;
      if (now - entry.lastActive > this.opts.roomTtlMs) {
        this.close(entry, 'This table timed out.');
        continue;
      }
      const humansPresent = room.seats.some((s) => !s.isBot && s.connected) || room.spectators.some((s) => s.connected);
      if (humansPresent) entry.lastPresent = now;
      else if (now - entry.lastPresent > this.opts.emptyRoomMs) {
        this.close(entry, 'Nobody was at the table.');
        continue;
      }

      let dirty = false;
      for (const [playerId, since] of [...entry.away]) {
        if (now - since < this.opts.afkGraceMs) continue;
        const seat = room.seats.find((s) => s.id === playerId);
        if (!seat) {
          // a spectator who never came back
          this.evict(entry, playerId, 'Disconnected.');
          continue;
        }
        if (room.phase === 'waiting') {
          this.evict(entry, playerId, 'Disconnected.');
          dirty = true;
        } else if (isBlocking(room, playerId)) {
          try {
            forceAct(room, playerId);
            dirty = true;
          } catch (e) {
            log('error', 'forceAct failed', { code: room.code, err: String(e) });
          }
        }
      }
      if (!this.rooms.has(room.code)) continue;
      // hand the host role to someone who is actually here
      const host = room.seats.find((s) => s.id === room.hostId);
      if (!host || (!host.connected && !host.isBot)) {
        const next = room.seats.find((s) => !s.isBot && s.connected);
        if (next && next.id !== room.hostId) {
          room.hostId = next.id;
          dirty = true;
        }
      }
      if (dirty) this.changed(entry);
    }
  }

  /* ---------------------------------------------------------------- helpers */

  view(code: string, playerId: string): RoomView {
    return buildView(this.entry(code).room, playerId);
  }

  private entry(rawCode: string): Entry {
    const e = this.rooms.get(rawCode.trim().toUpperCase());
    if (!e) throw new GameError('That table does not exist. Check the code.');
    return e;
  }

  private tokenOk(entry: Entry, playerId: string, token: string): boolean {
    const real = entry.tokens.get(playerId);
    if (!real || real.length !== token.length) return false;
    return timingSafeEqual(Buffer.from(real), Buffer.from(token));
  }

  private setConnected(entry: Entry, playerId: string, value: boolean) {
    const seat = entry.room.seats.find((s) => s.id === playerId);
    if (seat) seat.connected = value;
    const spec = entry.room.spectators.find((s) => s.id === playerId);
    if (spec) spec.connected = value;
  }

  private uniqueName(room: Room, name: string): string {
    const taken = new Set([...room.seats.map((s) => s.name), ...room.spectators.map((s) => s.name)]);
    if (!taken.has(name)) return name;
    for (let i = 2; i < 100; i++) {
      const candidate = `${name.slice(0, NAME_MAX - 3)} ${i}`;
      if (!taken.has(candidate)) return candidate;
    }
    return name;
  }

  private newCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new GameError('Could not allocate a table code. Try again.');
  }

  /** push fresh state to everyone and wake the bots */
  private changed(entry: Entry) {
    entry.lastActive = this.now();
    for (const [playerId, sockets] of entry.sockets) {
      const v = buildView(entry.room, playerId);
      for (const id of sockets) this.transport.emit(id, 'state', v);
    }
    this.scheduleBots(entry);
  }

  private nextBotMove(entry: Entry) {
    for (const seat of entry.room.seats) {
      if (!seat.isBot) continue;
      const action = botAction(entry.room, seat.id);
      if (action) return { id: seat.id, action };
    }
    return null;
  }

  private scheduleBots(entry: Entry) {
    if (entry.botTimer || !this.rooms.has(entry.room.code) || !this.nextBotMove(entry)) return;
    const delay = this.opts.botDelayMs === 0 ? 0 : this.opts.botDelayMs + Math.floor(Math.random() * 400);
    entry.botTimer = setTimeout(() => {
      entry.botTimer = null;
      if (!this.rooms.has(entry.room.code)) return;
      const move = this.nextBotMove(entry);
      if (!move) return;
      try {
        act(entry.room, move.id, move.action);
      } catch (e) {
        log('error', 'bot move failed, folding the bot out', { code: entry.room.code, err: String(e) });
        try {
          forceAct(entry.room, move.id);
        } catch {
          return;
        }
      }
      this.changed(entry);
    }, delay);
    entry.botTimer.unref?.();
  }
}

function newToken(): string {
  return randomBytes(24).toString('hex');
}
