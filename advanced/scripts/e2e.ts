/**
 * End-to-end check against a running server (dev or the production build).
 *   URL=http://localhost:3001 npm run e2e
 * Two humans and a bot play whole hands over real sockets. The script asserts chip conservation
 * on every state push, hidden-information rules, token auth, reconnects, and that the
 * swap / decline / equation paths all happen.
 */
import { io, type Socket } from 'socket.io-client';
import { bestArrangement } from '@numberpoker/shared';
import type { Ack, ClientToServerEvents, Command, JoinResult, RoomView, ServerToClientEvents } from '@numberpoker/shared';

const URL = process.env.URL ?? 'http://localhost:3001';
const HANDS = Number(process.env.HANDS ?? 14);
type Sock = Socket<ServerToClientEvents, ClientToServerEvents>;

let failures = 0;
const check = (cond: unknown, msg: string) => {
  if (!cond) {
    failures++;
    console.error(`  FAIL ${msg}`);
  } else console.log(`  ok   ${msg}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function connect(): Promise<Sock> {
  return new Promise((resolve, reject) => {
    const s: Sock = io(URL, { transports: ['websocket'], reconnection: false });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
}

const emit = <T>(s: Sock, event: 'room:create' | 'room:join', payload: object) =>
  new Promise<Ack<T>>((resolve) => (s.emit as any)(event, payload, resolve));
const command = (s: Sock, c: Command) => new Promise<Ack>((resolve) => s.emit('room:command', c, resolve));

class Player {
  view: RoomView | null = null;
  creds!: JoinResult;
  swaps = 0;
  declines = 0;
  forfeits = 0;
  private lastKey = '';
  private busy = false;
  private again = false;
  constructor(
    public name: string,
    public sock: Sock,
  ) {
    this.watch(sock);
  }

  watch(sock: Sock) {
    sock.on('state', (v) => {
      this.view = v;
      // chips in stacks plus the pot never change once a game is running
      if (v.phase !== 'waiting') {
        const sum = v.players.reduce((a, p) => a + p.chips, 0) + v.pot;
        const expected = v.players.length * v.limits.startingChips;
        if (sum !== expected) {
          failures++;
          console.error(`  FAIL chips not conserved for ${this.name}: ${sum} vs ${expected}`);
        }
      }
      void this.react();
    });
  }

  /** a fresh socket after a reconnect: forget in-flight work, whose ack died with the old socket */
  reattach(sock: Sock) {
    this.sock = sock;
    this.lastKey = '';
    this.busy = false;
    this.again = false;
    this.watch(sock);
  }

  /** one command in flight at a time; re-read the freshest state when it lands */
  private async react() {
    if (this.busy) {
      this.again = true;
      return;
    }
    this.busy = true;
    try {
      do {
        this.again = false;
        await this.decide(this.view!);
      } while (this.again);
    } finally {
      this.busy = false;
    }
  }

  private async decide(v: RoomView) {
    const me = v.players.find((p) => p.id === v.you);
    if (!me || v.isSpectator) return;
    const key = `${v.hand}|${v.phase}|${v.turn}|${v.pot}|${v.pendingSwap?.playerId}|${me.submitted}|${v.log.at(-1)?.seq}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    let cmd: Command | null = null;
    if (v.pendingSwap?.playerId === v.you) {
      const swap = (this.swaps + this.declines) % 2 === 0;
      cmd = swap ? { type: 'swap', op: this.swaps % 2 ? 'subtract' : 'add' } : { type: 'noSwap' };
      if (swap) this.swaps++;
      else this.declines++;
    } else if (v.betting && v.turn === v.you) {
      const r = Math.random();
      if (r < 0.1) cmd = { type: 'fold' };
      else if (r < 0.35 && v.betting.maxRaise >= 1) cmd = { type: 'raise', amount: Math.min(v.betting.maxRaise, v.betting.minRaise + Math.floor(Math.random() * 60)) };
      else cmd = { type: 'call' };
    } else if (v.phase === 'equation' && !me.folded && !me.submitted) {
      const hand = [...me.cards.filter((c) => c.kind !== 'hidden'), ...me.ops] as any[];
      const small = bestArrangement(hand, 1);
      const big = bestArrangement(hand, 20);
      if (small && big) {
        const ids = (o: { ordered: { id: string }[] }) => o.ordered.map((c) => c.id);
        const pick = Math.random();
        cmd =
          pick < 0.34
            ? { type: 'submit', betType: 'small', small: ids(small) }
            : pick < 0.67
              ? { type: 'submit', betType: 'big', big: ids(big) }
              : { type: 'submit', betType: 'both', small: ids(small), big: ids(big) };
      }
    }
    if (!cmd) return;
    await sleep(5);
    const res = await command(this.sock, cmd);
    if (!res.ok) {
      failures++;
      console.error(`  FAIL ${this.name} command ${JSON.stringify(cmd)} rejected: ${res.error}`);
    }
  }
}

async function until(cond: () => boolean, ms: number, what: string) {
  const t = Date.now();
  while (!cond()) {
    if (Date.now() - t > ms) throw new Error(`timed out waiting for ${what}`);
    await sleep(20);
  }
}

async function main() {
  console.log(`e2e against ${URL}`);
  const health = await fetch(`${URL}/healthz`).then((r) => r.json());
  check(health.ok === true, 'GET /healthz is ok');

  // --- table: Ada (host) + Bo + a bot --------------------------------------------------
  const a = new Player('Ada', await connect());
  const created = await emit<JoinResult>(a.sock, 'room:create', { name: 'Ada' });
  check(created.ok, 'create a table');
  if (!created.ok) throw new Error(created.error);
  a.creds = created;
  const code = created.code;

  const b = new Player('Bo', await connect());
  const joined = await emit<JoinResult>(b.sock, 'room:join', { code: code.toLowerCase(), name: 'Bo' });
  check(joined.ok, 'join by lower-case code');
  if (!joined.ok) throw new Error(joined.error);
  b.creds = joined;

  check((await command(a.sock, { type: 'addBot' })).ok, 'host adds a bot');
  check(!(await command(b.sock, { type: 'start' })).ok, 'a guest cannot start the game');
  const bad = await emit<JoinResult>(await connect(), 'room:join', { code: 'ZZZZZ', name: 'X' });
  check(!bad.ok, 'unknown code is refused');
  await until(() => a.view?.players.length === 3, 2000, 'three seats');

  check((await command(a.sock, { type: 'start' })).ok, 'host starts the game');
  await until(() => a.view?.phase !== 'waiting', 2000, 'game start');

  // --- privacy ------------------------------------------------------------------------
  await until(() => (a.view?.players.find((p) => p.id === b.creds.playerId)?.cards.length ?? 0) >= 2 || a.view?.phase === 'ended', 20000, 'cards dealt');
  if (a.view?.phase !== 'ended') {
    const bAsSeenByA = a.view!.players.find((p) => p.id === b.creds.playerId)!;
    const bAsSeenByB = b.view!.players.find((p) => p.id === b.creds.playerId)!;
    check(bAsSeenByA.cards.some((c) => c.kind === 'hidden'), "a player's first number card is hidden from others");
    check(!bAsSeenByB.cards.some((c) => c.kind === 'hidden'), 'a player sees their own cards');
    check(!JSON.stringify(a.view).includes('"deck"'), 'the deck is never sent');
  }

  // --- auth: a wrong token never gets someone else's seat ------------------------------
  const thief = await connect();
  const stolen = await emit<JoinResult>(thief, 'room:join', { code, name: 'Mallory', playerId: a.creds.playerId, token: 'wrong' });
  check(stolen.ok && stolen.playerId !== a.creds.playerId, 'a wrong token does not give Ada seat to someone else');
  const act = await command(thief, { type: 'fold' });
  check(!act.ok, 'a spectator cannot act');
  thief.close();

  // --- a spectator sees no secrets ----------------------------------------------------
  const spec = new Player('Spec', await connect());
  const sj = await emit<JoinResult>(spec.sock, 'room:join', { code, name: 'Watcher' });
  check(sj.ok && sj.spectator, 'late joiners become spectators');
  await sleep(100);
  check(spec.view?.isSpectator === true, 'spectator view is flagged');

  // --- reconnect mid-hand with the saved token -----------------------------------------
  b.sock.close();
  await sleep(150);
  b.reattach(await connect());
  const back = await emit<JoinResult>(b.sock, 'room:join', { code, name: 'Bo', playerId: b.creds.playerId, token: b.creds.token });
  check(back.ok && back.playerId === b.creds.playerId, 'reconnect with the token resumes the same seat');
  await sleep(100);
  check(b.view?.players.find((p) => p.id === b.creds.playerId)?.connected === true, 'seat shows as connected again');

  // --- play hands --------------------------------------------------------------------
  let hand = 0;
  const seenKinds = new Set<string>();
  while (hand < HANDS) {
    await until(() => a.view?.phase === 'ended', 60_000, `hand ${hand + 1} to finish`);
    hand = a.view!.hand;
    seenKinds.add(a.view!.result?.kind ?? 'none');
    const r = a.view!.result!;
    check(r.explanation.length > 0, `hand ${hand} has a payout explanation`);
    check(Object.values(r.payouts).reduce((x, y) => x + y, 0) === r.pot, `hand ${hand} pays out exactly the pot`);
    if (a.view!.matchWinnerId) {
      console.log(`  match over after ${hand} hands, resetting chips`);
      check((await command(a.sock, { type: 'reset' })).ok, 'host resets the match');
      await until(() => a.view?.phase === 'waiting', 2000, 'waiting after reset');
    }
    if (hand >= HANDS) break;
    await sleep(30);
    const res = await command(a.sock, { type: 'start' });
    if (!res.ok) throw new Error(`could not deal next hand: ${res.error}`);
    await until(() => a.view?.phase !== 'ended', 3000, 'next hand to begin');
  }

  check(a.swaps + b.swaps > 0, `a multiply swap happened (${a.swaps + b.swaps})`);
  check(a.declines + b.declines > 0, `a multiply decline happened (${a.declines + b.declines})`);
  check(seenKinds.has('showdown'), 'at least one hand reached a showdown');
  console.log(`  hands played: ${hand}, result kinds: ${[...seenKinds].join(', ')}`);

  for (const p of [a, b, spec]) p.sock.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall e2e checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error('e2e crashed:', e);
  process.exit(1);
});
