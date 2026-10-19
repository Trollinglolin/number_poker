import path from 'node:path';
import { fileURLToPath } from 'node:url';

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : fallback;
};

const here = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: num(process.env.PORT, 3001),
  /** built web app; the same relative path works from server/src and server/dist */
  webDist: process.env.WEB_DIST ?? path.resolve(here, '../../web/dist'),
  /** extra allowed browser origins (comma separated). Same-origin needs nothing. */
  corsOrigins: (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  maxRooms: num(process.env.MAX_ROOMS, 500),
  roomTtlMs: num(process.env.ROOM_TTL_MINUTES, 180) * 60_000,
  /** a player who is away this long while the table waits on them is folded out */
  afkGraceMs: num(process.env.AFK_GRACE_SECONDS, 45) * 1000,
  /** a room with nobody connected for this long is closed */
  emptyRoomMs: num(process.env.EMPTY_ROOM_MINUTES, 10) * 60_000,
  botDelayMs: num(process.env.BOT_DELAY_MS, 900),
};
