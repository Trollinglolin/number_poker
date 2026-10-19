# Deploying Number Poker

Nothing here has been run for you: no account, no deploy. The container is ready and the commands are below.

## What you are deploying

One Node process that serves the built web app **and** the realtime game over WebSockets on the same origin and port.
Game state lives in memory, so run **one instance**. See [Scaling](#scaling).

> **Vercel and other serverless hosts will not work** for the game server. Rooms live in memory and players hold open
> WebSocket connections, which serverless functions cannot do. (The old `hosting_guide.md` targeted Vercel; this replaces it.)
> Use any host that runs a long-lived container: Render, Fly.io, Railway, Google Cloud Run, a VPS.

## Check it locally first

```bash
npm ci
npm run build
npm start                 # http://localhost:3001
npm run e2e               # in another terminal: plays real hands over sockets
```

Or with Docker:

```bash
docker build -t number-poker .
docker run --rm -p 3001:3001 number-poker
```

## Configuration

All optional. Copy `.env.example` for a list.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3001` | Port to listen on. Most hosts set this for you. |
| `NODE_ENV` | `production` in the image | |
| `CORS_ORIGIN` | empty | Comma separated extra browser origins. Same-origin (the default setup) needs nothing. |
| `MAX_ROOMS` | `500` | New tables are refused above this. |
| `ROOM_TTL_MINUTES` | `180` | A table with no activity this long is closed. |
| `EMPTY_ROOM_MINUTES` | `10` | A table with nobody connected this long is closed. |
| `AFK_GRACE_SECONDS` | `45` | Seconds before an absent player who is holding up the table is folded. |
| `BOT_DELAY_MS` | `900` | How long a bot "thinks". |

Health check: `GET /healthz` returns `{ ok, rooms, connections, uptime }`.

## Render

1. Push the repo to GitHub.
2. New > **Blueprint**, pick the repo. `advanced/render.yaml` uses `rootDir: advanced` and the Dockerfile.
   (Render looks for `render.yaml` at the repo root, so copy it there or create the service by hand:
   *Web Service*, Runtime **Docker**, Root directory `advanced`, Health check path `/healthz`.)
3. Use a paid instance type: the free tier sleeps, which drops everyone's game.

## Fly.io

```bash
cd advanced
fly launch --no-deploy --copy-config      # edit app name in fly.toml first
fly scale count 1
fly deploy
```

`fly.toml` keeps one machine always running and uses `/healthz`.

## Railway

New project > Deploy from GitHub repo > set **Root Directory** to `advanced`. Railway detects the Dockerfile and sets `PORT`.

## Google Cloud Run

```bash
gcloud run deploy number-poker --source advanced --region <region> \
  --allow-unauthenticated --max-instances 1 --min-instances 1 \
  --session-affinity --timeout 3600
```

`--max-instances 1` is required (state is in memory). `--timeout 3600` lets WebSockets stay open up to an hour; clients reconnect
and rejoin their seat automatically when it drops.

## Scaling

- Work per move is tiny (a table is a few kilobytes and a move is a handful of array operations), so one instance should serve a
  lot of friend-group tables, but this has not been load tested. Measure with your own traffic, and scale **up** (more CPU and
  RAM) before out.
- The game rules live in a pure engine (`shared/src/engine.ts`) with no I/O. Tables are independent of each other.
- To go beyond one instance you need two things: (1) route every player of a table to the same instance (consistent hashing on the
  table code, or sticky sessions), and (2) optionally move table state to a shared store such as Redis so a table survives a restart.
  The `RoomManager` in `server/src/rooms.ts` is the single place to change for that. It is not built, because one instance is enough
  until you have a lot of concurrent tables.
- Restarts drop all tables (state is in memory). Clients get a message and return to the home screen.

## After deploying

- Open the URL, create a table, and join it from a second device or browser window.
- Put the service behind your domain with the platform's custom domain feature. HTTPS and WebSockets (`wss://`) work with no
  changes because the client always connects to the page's own origin.
- Watch the JSON logs (one object per line) for `room created`, `room closed` and any `error` lines.
