# Handoff: Number Poker rebuild (`advanced/`)

Written for an agent with no memory of the build. Read this first, then `README.md` (user-facing), `docs/RULES.md`
(the rules), `docs/DEPLOY.md` (hosting). Everything below was true at commit `4b42d72` plus the `verify` script.

## Status in one paragraph

A realtime multiplayer card game, rebuilt from the user's 2023 project (repo root `client/`, `server/`, `shared/`, which are
**untouched and should stay that way**). It is **finished and verified, nothing is half-done**. It looks and plays like a poker
room, has blinds and a dealer button (added on the user's request), fits one screen on a desktop browser, and is packaged for
cloud hosting. It is **not hosted**: the user said not to host it yet. Do not deploy anything unless they say so.

## Where it lives

- Repo: `https://github.com/Trollinglolin/number_poker`. Branch **`worktree-advanced-rebuild`**, pushed. `main` is untouched.
  No pull request was opened (compare view: `.../compare/main...worktree-advanced-rebuild`). Open one only if the user asks.
- The original session worked in a git worktree at `.claude/worktrees/advanced-rebuild`, which may no longer exist. To get the code:
  `git fetch origin && git switch worktree-advanced-rebuild` (or `git worktree add ../np-advanced origin/worktree-advanced-rebuild`).
- All the work is in the `advanced/` folder (npm workspaces: `shared`, `server`, `web`).
- Never push to `main`, never force-push. Commit trailer used throughout: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## First five minutes

```bash
cd advanced
npm ci                              # Node 22.12+ (built on 26)
npx playwright install chromium     # once, for the browser checks
npm run verify                      # typecheck + unit tests + build + e2e + all browser checks (several minutes)
npm run dev                         # server :3001 and web :5173 (http://localhost:5173)
```

`npm run verify` (`scripts/verify.sh`) is the definition of "working". It ends with `ALL CHECKS PASSED`. If it does, the project
is in the state this document describes.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | server (tsx watch) + Vite dev server; Vite proxies `/socket.io` to `:3001` |
| `npm run build` / `npm start` | builds `web/dist` and the bundled `server/dist/server.mjs`; `start` serves both on `:3001` |
| `npm test` | Vitest: shared engine, server rooms, chip maths (68 tests at last run) |
| `npm run typecheck` | `tsc` for all three packages |
| `npm run e2e` | real socket.io clients (two humans + a bot) play hands against a running server (`URL=http://localhost:3001`) |
| `npm run verify` | everything above against a production build, plus the browser scripts below |

Browser scripts (Playwright, in `scripts/`, all take `URL=` and `OUT=` for screenshots; run them against a **production
build** server: `NODE_ENV=production BOT_DELAY_MS=110 PORT=3939 node server/dist/server.mjs`):

- `shots.ts`: plays a whole hand through the real UI (lobby, bets, swap, equation, showdown), phone + desktop, dark + light.
  It is also the UI regression test. It fails on any console error.
- `table-shots.ts`: seats N bots (`BOTS=1,3,7`), captures phone and desktop. Crowding check. `THEME=light`, `REDUCED=1` supported.
- `bets-shot.ts`: raises preflop against slow bots (`BOT_DELAY_MS=1200`) so chips are on the table. `BOTS=7` for 8 players.
- `fit-check.ts`: opens the game at 1280x600, 1366x650, 1440x790, 1920x970 and asserts the page never scrolls and key controls
  (your hand, Fold, Lock in, Deal next hand) are inside the window. `ONLY=1280x600`, `BOTS=1,7`, `THEME=light`.

Screenshots are the evidence for layout work: **look at them**, the assertions alone are not enough (the desktop shell uses
`overflow-hidden`, so "no page scroll" is partly true by construction; clipping and overlap only show in images).

## Architecture map

```
shared/src   pure TypeScript, no I/O, used by both sides (bundled into the server, imported by Vite)
  types.ts      Room, Seat, Action, Showdown ...        cards.ts    deck, colours, blinds constants, MAX_PLAYERS
  engine.ts     THE game: state machine (startHand, act, forceAct, resetMatch, bettingLimits ...)
  equation.ts   evaluate / analyze / validateEquation / arrangements solver (exact original maths)
  settle.ts     pot payout + tiebreaks (exact original logic)       bot.ts   practice opponent (uses the solver)
  views.ts      buildView(room, viewerId): what ONE player may see   protocol.ts  socket event + command types
server/src   index.ts (Express + Socket.IO, static hosting, /healthz, rate limit, CSP) ; rooms.ts (RoomManager: tables,
             private reconnect tokens, per-viewer broadcasts, bots, away-player folding, TTL) ; schemas.ts (zod) ; config.ts (env)
web/src      App.tsx (screen switch) ; screens/{Home,Lobby,Table}.tsx ; lib/client.ts (socket store + saved session)
  components/PokerTable.tsx   oval table, seats, chips, flights   ActionDock.tsx   bet controls (phone dock / desktop panel)
  EquationBuilder.tsx   tap / drag / keyboard builder   Showdown.tsx   payout explanation   HoleCards.tsx   your cards
  Chips.tsx + lib/chipMath.ts   chip stacks (display only)   lib/geometry.ts   seat positions   lib/icons.ts   icon imports
```

Flow: browser `room:command` -> zod validation -> `RoomManager.command` -> `engine.act` -> `buildView` per connected player ->
`state` event. The server is **authoritative**; the client never computes game results.

Phases: `waiting -> preflop -> dealing1 -> betting1 -> dealing2 -> betting2 -> equation -> ended`. Dealing pauses on a
`pendingSwap` when a player draws a multiply card.

## Rules: the source of truth (do not "fix" these)

- **The 2023 code is the rule source, not `prompt.txt`.** They disagree (numbers 0-10, players start with + - ÷, deck has ×,
  hidden card is the FIRST one dealt, etc.). The table is in `docs/RULES.md`. The user said "keep the rules exact", and the code
  is what they played.
- Equation evaluation and payouts are **proved identical** to the original by `shared/test/oracle.ts`, which is the original code
  copied verbatim, and `equation.test.ts` / `settle.test.ts` (differential fuzz). **Do not clean up or refactor `oracle.ts`.**
- Deliberate deviations (all listed in `docs/RULES.md`): server-side validation, forfeit when no legal equation exists, raise cap
  so everyone can call (no side pots), split when two "both" bettors each win one pool, bots follow human rules, away-player
  folding, 8-player cap.
- **Blinds are an addition the user asked for**: dealer button moves each hand, small 5 / big 10 posted automatically, order of
  play as in Hold'em (heads-up: dealer posts the small blind), big blind keeps the option, minimum raise = big blind, blinds
  shrink to the shortest stack so side pots are never needed. The fuzz in `engine.test.ts` asserts that invariant (every all-in
  bet equals the bet to match).
- Not added on purpose: escalating blinds, side pots, a turn timer. Do not add rules without the user asking.

## Design rules (kept consistent on purpose)

- Tailwind v4, tokens in `web/src/styles.css`. One accent (mint). Small = sky and big = coral are semantic colours only.
  Controls are pills, panels are 28px "double bezel", playing cards 10px.
- The poker table is a physical object: felt, rail and plates stay dark in **both** themes and use the `--felt-*` tokens
  (e.g. `text-felt-accent`, not `text-accent`, on the table or contrast breaks in light theme). Textures are CSS only.
- No em dashes or en dashes in any visible text. Sentence case. Proper ellipsis `…` and curly quotes. Fonts: Geist (self-hosted).
- Icons only through `web/src/lib/icons.ts` (deep Phosphor imports). Add new icons there.
- Motion uses transform and opacity only, and must degrade with `prefers-reduced-motion` (`useReducedMotion`; flights are skipped).
- Stack chips are decoration: the exact number is always printed beside them.

## Layout model (the part most likely to bite)

- Phones and tablets (<1024px): scrolling page, portrait oval table, bottom `ActionDock` (also shows your cards).
- Desktop (>=1024px, `useMedia`): fixed-height shell (`h-dvh overflow-hidden`): fitted table + one-row hand on the left, side panel
  (`ActionPanel`, showdown, `EventLog`) on the right. Table fitting uses CSS container query units (`.fit-parent` / `.table-fit`).
- `PokerTable` measures itself with a `ResizeObserver`; `compact = !desktop || box.w < 820` switches plates, card fans and bet
  display to compact forms. On short landscape tables a side seat's cards sit **beside** its plate (`side` prop).
- Render the dock OR the side panel with `useMedia`, **never both** (both contain `#raise-amount`).
- Tables get taller with more seats (`portraitAspect` / `landscapeRatio` in `geometry.ts`). Tune those, not individual margins.

## Gotchas learned the hard way

- Server build (`server/package.json`) externalizes only `express`, `socket.io`, `zod`. The shared package MUST stay bundled. If
  you add a server dependency, add a matching `--external:` and list it under `server` dependencies. Web libraries are
  devDependencies on purpose (they are bundled into `web/dist`), which keeps the Docker image small.
- Static files are sent with `res.sendFile('index.html', { root })`. Plain absolute paths 404 when the install path contains a
  dot-directory (like `.claude/`).
- The saved seat lives in `localStorage` (`np.session`), so a second tab in the same browser is the same player. Test two humans
  with a second browser, a private window, or another device.
- Engine tests use stacked decks (`stack(room, ['n3g', ...])`) and `numbersOnly(room)` so a random multiply draw cannot pause
  dealing; act with `callUntil(room, phase)` rather than hard-coding who acts (the order depends on the button).
- `Docker build` was **not run** (the local Docker daemon was off). The install/build/prune/run sequence was simulated by hand
  and the lockfile has the Linux musl binaries. First thing to do before deploying: `docker build -t number-poker advanced`.
- If your harness refuses compound shell commands in a git worktree, run each git command as its own call.
- Phosphor's `PlayingCardsIcon` does not exist; `CardsIcon` is used.

## Verified vs not verified

Verified (by `npm run verify`, last run green): typecheck; 68 unit tests incl. 300-match fuzz; 15-hand e2e with a bot; a full
hand in a real browser at phone and desktop sizes in both themes; 2/4/8-player crowding on phone and desktop; one-screen fit at
four window sizes including a crowded final betting round; reduced motion.

**Not verified:** real Safari / iPhone (emulated Chromium only); `docker build`; two humans in two browsers; load or latency;
the largest possible hand (10 cards) in the "both" builder at the smallest window (it scrolls inside its panel, not the page);
performance of the felt grain and backdrop blur on low-end phones.

## Known small issues

- At 1280x600 with 8 players, a seat's "SB"/"BB" tag can be partly hidden behind the neighbouring plate.
- Any seated player can deal the next hand immediately (the original did too); a connected but idle player can stall the table
  (no turn timer; disconnected players are folded after 45s).
- Windows narrower than 1024px use the scrolling layout (a browser snapped to half a 1920 screen, or a laptop at 150% zoom).

## Sensible next steps (none started; ask the user first)

1. `docker build` + `docker run`, then deploy per `docs/DEPLOY.md` (Render / Fly / Railway / Cloud Run). One instance only
   (state is in memory; `RoomManager` is the place to add a shared store).
2. Escalating blinds (a level table keyed on hand number is a small change in `startHand`; the UI already prints blinds).
3. A turn timer for connected players; side pots (then the blind-scaling simplification can go).
4. Test on a real phone and in Safari; a two-human test; a load test.

## History in one screen (all on the branch)

1. Shared rules engine + differential tests against the original code. 2. Socket server (rooms, tokens, per-viewer state,
bots, away folding) + e2e. 3. React web app, browser UI test, production bundle fixes. 4. Dockerfile + docs.
5. Review fixes (folded cards no longer leak at showdown; spectators sit on reset). 6. Poker-room redesign (felt table, chips,
animations, quick-bet chips, lobby as a table). 7. Blinds + dealer button + minimum raise. 8. One-screen desktop layout and the
fit checks. 9. `verify` script and this handoff.

Skills used while building (Claude Code): `design-taste-frontend`, `high-end-visual-design`, `redesign-existing-projects`,
`web-design-guidelines`. Image-generation skills were not available, which is why every texture is CSS.
