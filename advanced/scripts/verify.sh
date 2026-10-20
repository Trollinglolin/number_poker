#!/bin/sh
# One command that proves the project works: typecheck, unit tests, production build, then the
# end-to-end and browser checks run against that production build. Takes several minutes.
#   npm run verify                      # screenshots go to a temp folder (printed below)
#   OUT=./shots PORT=3939 npm run verify
# Needs the browser once:  npx playwright install chromium
set -e
cd "$(dirname "$0")/.."

PORT="${PORT:-3939}"
OUT="${OUT:-$(mktemp -d)}"
mkdir -p "$OUT"
echo "== screenshots and the server log go to $OUT"

echo "== typecheck"
npm run typecheck

echo "== unit tests"
npm test

echo "== production build"
npm run build

echo "== starting the production server on :$PORT"
NODE_ENV=production BOT_DELAY_MS=110 PORT="$PORT" node server/dist/server.mjs >"$OUT/server.log" 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT INT TERM
until curl -sf "localhost:$PORT/healthz" >/dev/null; do sleep 0.5; done
export URL="http://localhost:$PORT"

echo "== e2e: real socket clients play 15 hands"
HANDS=15 npx tsx scripts/e2e.ts

echo "== browser: a full hand through the real UI (phone + desktop, dark + light)"
OUT="$OUT/flow" npx tsx scripts/shots.ts

echo "== browser: 2, 4 and 8 players around the table (phone + desktop)"
BOTS=1,3,7 OUT="$OUT/table" npx tsx scripts/table-shots.ts

echo "== browser: one-screen fit at four window sizes, 2 and 8 players"
BOTS=1,7 OUT="$OUT/fit" npx tsx scripts/fit-check.ts

echo "ALL CHECKS PASSED (screenshots in $OUT)"
