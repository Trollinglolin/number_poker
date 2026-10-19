# Number Poker (rebuild)

A realtime multiplayer card game: bet like poker, then build the equation that lands closest to **1** or **20**.
This is a ground-up rebuild of the original project with the **same rules and the same equation maths**, a new interface,
and a server that is ready to deploy.

- Rules as implemented, and the few deliberate fixes: [docs/RULES.md](docs/RULES.md)
- Deploying (Docker, Render, Fly.io, Railway, Cloud Run): [docs/DEPLOY.md](docs/DEPLOY.md)

## Run it

Requires Node 22.12 or newer.

```bash
npm install
npm run dev          # game server on :3001, web app on http://localhost:5173
```

Open the web app, enter a name and choose **Create a table**, or **Practice against a bot** to play alone. Friends join with the
five-character table code or the invite link. To try two humans yourself, use a second device, another browser or a private
window: a second tab in the same browser reuses the first tab's saved seat.

Production build:

```bash
npm run build && npm start     # everything on http://localhost:3001
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Server (tsx watch) and web app (Vite) together |
| `npm run build` | Builds `web/dist` and the bundled `server/dist/server.mjs` |
| `npm start` | Runs the production server, which also serves the web app |
| `npm test` | Unit, differential and fuzz tests (Vitest) |
| `npm run typecheck` | TypeScript across all three packages |
| `npm run e2e` | Plays real hands over sockets against a running server (`URL=http://localhost:3001`) |

`scripts/shots.ts` drives the real UI in a browser (Playwright) through a whole hand and saves screenshots at phone and desktop sizes.

## How it is organised

```
shared/   rules engine, equation evaluator and solver, payouts, bot, per-player views (pure TypeScript, no I/O)
server/   Express + Socket.IO: tables, private reconnect tokens, validation, absent-player handling, static hosting
web/      React 19 + Tailwind v4 + Motion: home, lobby and table screens, equation builder
```

- The **server is authoritative.** Clients send intents (`fold`, `raise`, `submit` ...) and receive their own view of the table.
  Other players' hidden card, everyone's equations and the deck never leave the server before the showdown.
- The engine is a plain state machine, so it is tested directly: scripted hands with stacked decks, a fuzz that plays 300 whole
  matches, and differential tests against the original code (see RULES.md).
- Tables live in memory behind `RoomManager` (`server/src/rooms.ts`). That is the one place to change to add a shared store.

## Interface notes

- It looks and plays like a card room: an oval felt table with everyone seated around it, bets as chip stacks in front of each seat
  (a small chip-and-number pill inside the seat on phones), swept into the pot between the first and second, and second and third,
  betting rounds. Cards are dealt out from the middle and the pot flies to the winner at the showdown. The felt, rail, chips and
  cloth grain are all CSS (no images). Chip stacks are decoration, the exact number is always printed beside them.
- Phone first. The table turns into a portrait oval and grows taller as more people sit (up to 8). Betting controls sit in a bottom
  dock that also carries your own cards, so they are never scrolled out of view. Tap any seat for that player's full cards.
- The equation builder works by tap, drag or keyboard (arrow keys move a placed card, Delete removes it), shows the live result and
  the distance to the target, and explains in words why an order is not valid.
- Dark and light themes (follows the system, with a toggle), reduced-motion respected, native dialogs for focus handling.
