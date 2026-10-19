import type { Action } from './types';
import type { RoomView } from './views';

/** Everything a client can ask the server to do. Game actions plus table management. */
export type Command =
  | Action
  | { type: 'start' }
  | { type: 'addBot' }
  | { type: 'kick'; playerId: string }
  | { type: 'leave' }
  | { type: 'reset' };

export interface Credentials {
  playerId: string;
  token: string;
}

export interface CreatePayload {
  name: string;
}

export interface JoinPayload {
  code: string;
  name: string;
  /** present when reconnecting to a seat held earlier */
  playerId?: string;
  token?: string;
}

export interface JoinResult extends Credentials {
  code: string;
  spectator: boolean;
}

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export interface ClientToServerEvents {
  'room:create': (p: CreatePayload, ack: (r: Ack<JoinResult>) => void) => void;
  'room:join': (p: JoinPayload, ack: (r: Ack<JoinResult>) => void) => void;
  'room:command': (c: Command, ack: (r: Ack) => void) => void;
}

export interface ServerToClientEvents {
  state: (v: RoomView) => void;
  /** the table was closed, you were removed, or it timed out */
  'room:closed': (reason: string) => void;
}

export const NAME_MAX = 16;
export const CODE_LENGTH = 5;
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
