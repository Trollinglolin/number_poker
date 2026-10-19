# Rules as implemented

This rebuild keeps the rules of the **2023 code**, not the wording of `prompt.txt` in the repo root. The code is what was
played and patched ("Fixed Winning and Betting logic"), and the written spec had drifted from it. The tests prove the
equation maths and the payouts match the original code (see [Verification](#verification)).

## The game

- 2 to 8 players, 1,000 chips each. A match ends when one player holds every chip.
- Deck: number cards 0 to 10 in four colours (gold, silver, bronze, dark), 4 multiply cards, 4 square root cards.
- Everyone starts every hand holding **add, subtract and divide**.

### A hand

1. **Betting round 1**, before any cards, after the blinds are posted (see below).
2. Deal number cards until everyone has **2**. **Betting round 2.**
3. Deal until everyone has **4**. **Betting round 3.**
4. Everyone builds an equation, chooses **small**, **big** or **both**, and locks it in.
5. Equations are revealed and the pot is paid out.

Betting is Texas Hold'em style: fold, check or call, or raise. A raise is "raise by N" on top of the bet to match.

### Blinds and the button (added on request)

The original had no forced bets, so a table of cautious players could check every hand and nothing ever moved. Blinds fix that.

- A **dealer button** moves one seat clockwise every hand, skipping players who are out of chips or sitting out. If the dealer
  leaves, the button carries on from where it was.
- The next two players post a **small blind (5)** and a **big blind (10)**. Heads-up, the dealer posts the small blind.
- Before the first cards the player after the big blind acts first, and the **big blind keeps the option to raise** when the action
  comes back around. After that, the first player to act in each round is the one after the button.
- The **minimum raise is the big blind** (or everything that can be raised, if that is less).
- If the shortest stack cannot cover the blinds, both blinds shrink to fit it. That keeps every bet fully matched, so there are
  never side pots. (A simplification: real poker would use side pots.)
- Blinds are constant. Raising them over time is easy to add if matches drag on.

### Special cards

- **Square root** is an extra card: the player draws again, so they still end with four number cards. It applies to the one
  number card directly after it.
- **Multiply**: the player may trade their **add or subtract** for it, or decline and discard it. A player can hold only one
  multiply. A multiply drawn straight after a square root (before a number card) is discarded, as in the original.
- Only the **first number card you were dealt** is hidden from other players.

### Building an equation (exactly the original rules)

- Use **every** card you hold once.
- First and last card must be numbers. No two numbers in a row. No two operators in a row, except an operator followed by a square root.
- A square root applies to the single number right after it. There are no brackets.
- Evaluated with JavaScript precedence (`x` and `/` before `+` and `-`, left to right) in IEEE doubles. The result must be finite
  (no division by zero).

### Winning

- **Small** players compete for the closest to **1**, **big** players for the closest to **20**. A "both" bettor is in both pools.
- Closest wins, compared with exact floating-point equality.
- **Tiebreak** uses a card key `value * 10 + colour rank` (dark 0, bronze 1, silver 2, gold 3) over all number cards a player holds:
  small tie, the **lowest** key wins; big tie, the **highest** key wins.
- Payout:
  1. Everyone bet small (or everyone big): the winner takes the whole pot.
  2. One player wins both pools: they take the whole pot.
  3. A "both" bettor who did not win both pools loses that claim; the small winner takes the whole pot (if the small winner is
     also such a loser, the big winner does).
  4. Otherwise the small winner gets `floor(pot / 2)` and the big winner `ceil(pot / 2)`.

## Where the code and `prompt.txt` disagree

| Topic | `prompt.txt` | The 2023 code (kept) |
| --- | --- | --- |
| Number cards | 1 to 10 | **0 to 10** |
| Starting operators | add, minus, multiply | **add, subtract, divide** |
| Special cards in the deck | 4 division, 4 square root | **4 multiply, 4 square root** |
| Drawing the swap card | trade it for a card you hold | trade **add or subtract** for multiply, or decline |
| Hidden card | the last number card | the **first** number card |
| First betting round | everyone pays 1 chip | no ante in the original; this rebuild uses **blinds** (5 and 10) instead, see above |
| Small tie | smallest card's colour, gold biggest | lowest card wins, then dark beats gold |

The original's lack of any forced bet meant an all-check hand had an empty pot. Blinds replace both the spec's 1-chip ante and
that behaviour, so every hand has something to win.

## Deliberate deviations from the 2023 code

These only touch places where the original could freeze, lose chips, or trust the browser:

1. **The server validates everything.** The original enforced the equation rules only in the browser. Now the server checks that
   every card is used once, the structure, and that the result is finite. Hidden cards and equations are never sent to
   other players (the original broadcast the whole state, including the deck).
2. **Hands with no valid equation forfeit.** Four square roots, or four zeros with a divide, cannot make a legal equation and
   froze the original. Now that player forfeits the hand and their bets stay in the pot.
3. **Raise cap.** A raise is limited so every active player can still call. The original could let chips go negative.
4. **Bets reset each betting round** and a round ends when everyone has acted and matched. Chip flow is identical.
5. **Two "both" bettors who each won one pool**: the original silently dropped the pot. Now the small and big winners split it.
6. **Multiply swap** is limited to add/subtract on the server too (the original only hid divide in the UI).
7. **Bots** follow the same rules as people and build real equations with a solver (the original bot wrote invalid ones).
8. **Absent players.** After 45 seconds away while the table waits on them, a player is folded (a swap is declined). A player who
   is disconnected when a hand starts sits it out. Seats are held for reconnects with a private token.
9. **Seats.** Maximum 8 players; the host starts the first hand; mid-game joiners spectate.

## Verification

`npm test` runs, among other things:

- the **original** `safeEval`, client evaluator and payout function, copied verbatim into `shared/test/oracle.ts`, compared against the new code:
  every random valid arrangement evaluates to the identical number, the exhaustive set of accepted card orders is identical,
  and 4,000 random showdowns pay out identically (the one exception above is asserted explicitly);
- a 300-match fuzz that plays whole matches with 2 to 8 players and checks chips are conserved and the game never stalls.
