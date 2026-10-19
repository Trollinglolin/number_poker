import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameError } from '@numberpoker/shared';
import type { RoomView } from '@numberpoker/shared';
import { RoomManager } from '../src/rooms';
import type { Transport } from '../src/rooms';

let clock = 1_000_000;
const sent: { socket: string; event: string; payload: any }[] = [];

const transport: Transport = {
  emit: (socket: string, event: string, payload: any) => {
    sent.push({ socket, event, payload });
  },
} as Transport;

function manager() {
  return new RoomManager(
    { maxRooms: 3, roomTtlMs: 60 * 60_000, afkGraceMs: 30_000, emptyRoomMs: 5 * 60_000, botDelayMs: 0, now: () => clock },
    transport,
  );
}

const lastState = (socket: string): RoomView =>
  [...sent].reverse().find((s) => s.socket === socket && s.event === 'state')!.payload;

beforeEach(() => {
  clock = 1_000_000;
  sent.length = 0;
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

/** a table with a host (socket h) and a guest (socket g) */
function twoPlayers(m: RoomManager) {
  const host = m.create('Ada');
  m.attach(host.code, host.playerId, 'h');
  const guest = m.join(host.code, 'Bo');
  m.attach(host.code, guest.playerId, 'g');
  return { code: host.code, host, guest };
}

describe('joining and credentials', () => {
  it('creates a table with a short code and lets people join by code', () => {
    const m = manager();
    const { code, host, guest } = twoPlayers(m);
    expect(code).toMatch(/^[A-Z2-9]{5}$/);
    expect(guest.spectator).toBe(false);
    expect(lastState('h').players.map((p) => p.name)).toEqual(['Ada', 'Bo']);
    expect(host.token).not.toBe(guest.token);
  });

  it('accepts lower-case codes and de-duplicates names', () => {
    const m = manager();
    const { code } = twoPlayers(m);
    const dup = m.join(code.toLowerCase(), 'Bo');
    m.attach(code, dup.playerId, 'x');
    expect(lastState('x').players.map((p) => p.name)).toEqual(['Ada', 'Bo', 'Bo 2']);
  });

  it('reconnects with the right token but never hands a seat to a wrong token', () => {
    const m = manager();
    const { code, guest } = twoPlayers(m);
    const again = m.join(code, 'Bo', { playerId: guest.playerId, token: guest.token });
    expect(again.playerId).toBe(guest.playerId);
    const thief = m.join(code, 'Mallory', { playerId: guest.playerId, token: 'nope' });
    expect(thief.playerId).not.toBe(guest.playerId);
  });

  it('rejects unknown codes and bad names', () => {
    const m = manager();
    expect(() => m.join('ZZZZZ', 'Bo')).toThrow(/does not exist/);
    expect(() => m.create('   ')).toThrow(GameError);
    expect(m.create('<b>Eve</b>').code).toBeTruthy();
  });

  it('caps the number of rooms', () => {
    const m = manager();
    m.create('a');
    m.create('b');
    m.create('c');
    expect(() => m.create('d')).toThrow(/busy/);
  });
});

describe('commands', () => {
  it('only the host can start the first hand, and it needs two players', () => {
    const m = manager();
    const host = m.create('Ada');
    m.attach(host.code, host.playerId, 'h');
    expect(() => m.command(host.code, host.playerId, { type: 'start' })).toThrow(/two players/i);
    const guest = m.join(host.code, 'Bo');
    m.attach(host.code, guest.playerId, 'g');
    expect(() => m.command(host.code, guest.playerId, { type: 'start' })).toThrow(/only the host/i);
    m.command(host.code, host.playerId, { type: 'start' });
    expect(lastState('h').phase).toBe('preflop');
  });

  it('each socket only receives its own view of the cards', () => {
    const m = manager();
    const { code, host, guest } = twoPlayers(m);
    m.command(code, host.playerId, { type: 'start' });
    m.command(code, host.playerId, { type: 'call' });
    m.command(code, guest.playerId, { type: 'call' });
    // dealing may pause on a multiply swap (more than once); resolve every pause
    for (let i = 0; i < 6; i++) {
      const pending = lastState('h').pendingSwap;
      if (!pending) break;
      m.command(code, pending.playerId, { type: 'noSwap' });
    }
    const hv = lastState('h');
    const gv = lastState('g');
    const hostAsSeenByGuest = gv.players.find((p) => p.id === host.playerId)!;
    const hostAsSeenByHost = hv.players.find((p) => p.id === host.playerId)!;
    expect(hostAsSeenByGuest.cards.some((c) => c.kind === 'hidden')).toBe(true);
    expect(hostAsSeenByHost.cards.some((c) => c.kind === 'hidden')).toBe(false);
    expect(JSON.stringify(gv)).not.toContain('"deck"');
  });

  it('latecomers watch as spectators and cannot act', () => {
    const m = manager();
    const { code, host, guest } = twoPlayers(m);
    m.command(code, host.playerId, { type: 'start' });
    const late = m.join(code, 'Cy');
    expect(late.spectator).toBe(true);
    m.attach(code, late.playerId, 'late');
    const v = lastState('late');
    expect(v.isSpectator).toBe(true);
    expect(() => m.command(code, late.playerId, { type: 'call' })).toThrow(GameError);
    void guest;
  });

  it('host-only: add bot, kick, reset', () => {
    const m = manager();
    const { code, host, guest } = twoPlayers(m);
    expect(() => m.command(code, guest.playerId, { type: 'addBot' })).toThrow(/only the host/i);
    m.command(code, host.playerId, { type: 'addBot' });
    expect(lastState('h').players).toHaveLength(3);
    m.command(code, host.playerId, { type: 'kick', playerId: guest.playerId });
    expect(lastState('h').players).toHaveLength(2);
    expect(sent.some((s) => s.socket === 'g' && s.event === 'room:closed')).toBe(true);
  });
});

describe('absent players', () => {
  it('folds a player who holds up the table after the grace period', () => {
    const m = manager();
    const { code, host, guest } = twoPlayers(m);
    m.command(code, host.playerId, { type: 'start' });
    expect(lastState('h').turn).toBe(host.playerId);
    m.detach('h');
    clock += 29_000;
    m.sweep();
    expect(lastState('g').phase).toBe('preflop');
    clock += 2_000;
    m.sweep();
    const v = lastState('g');
    expect(v.phase).toBe('ended');
    expect(v.result?.winnerIds).toEqual([guest.playerId]);
  });

  it('removes someone who drops out of the waiting room and passes on the host', () => {
    const m = manager();
    const { code, host } = twoPlayers(m);
    m.detach('h');
    clock += 31_000;
    m.sweep();
    const v = lastState('g');
    expect(v.players.map((p) => p.name)).toEqual(['Bo']);
    expect(v.hostId).not.toBe(host.playerId);
    void code;
  });

  it('closes tables that nobody is at, and tables past their time limit', () => {
    const m = manager();
    const { code } = twoPlayers(m);
    m.detach('h');
    m.detach('g');
    clock += 6 * 60_000;
    m.sweep();
    expect(m.roomCount).toBe(0);
    void code;

    const m2 = manager();
    const t = twoPlayers(m2);
    clock += 61 * 60_000;
    // keep the sockets "present" so only the time limit applies
    m2.sweep();
    expect(m2.roomCount).toBe(0);
    expect(sent.some((s) => s.event === 'room:closed')).toBe(true);
    void t;
  });
});

describe('bots', () => {
  it('a bot plays its turns on its own', () => {
    const m = manager();
    const host = m.create('Ada');
    m.attach(host.code, host.playerId, 'h');
    m.command(host.code, host.playerId, { type: 'addBot' });
    m.command(host.code, host.playerId, { type: 'start' });
    // human checks; the bot (second seat) should call without anyone touching it
    m.command(host.code, host.playerId, { type: 'call' });
    vi.runOnlyPendingTimers();
    const v = lastState('h');
    expect(['dealing1', 'betting1']).toContain(v.phase);
  });
});
