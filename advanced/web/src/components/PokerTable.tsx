import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { CardView, OpCard, PlayerView, RoomView } from '@numberpoker/shared';
import { OP_SYMBOL } from '@numberpoker/shared';
import { HERO_SLOT, landscapeAspect, portraitAspect, seatSlots, towardCentre } from '../lib/geometry';
import type { Point, SeatSlot } from '../lib/geometry';
import { chips, cn } from '../lib/format';
import { headline } from '../lib/headline';
import { CoinsIcon, CrownSimpleIcon, UserPlusIcon, WifiSlashIcon } from '../lib/icons';
import { useMedia } from '../lib/useMedia';
import { AnimatedNumber } from './AnimatedNumber';
import { Chip, ChipStack } from './Chips';
import { chipBreakdown } from '../lib/chipMath';
import { PlayingCard } from './cards';
import { Avatar, Button, Sheet } from './ui';

/* ------------------------------------------------------------------ helpers */

/** numbers first (dealt order), then extra square root / multiply cards */
function dealtCards(p: PlayerView): CardView[] {
  const numbers = p.cards.filter((c) => c.kind === 'number' || c.kind === 'hidden');
  const extras = p.cards.filter((c) => c.kind === 'op');
  return [...numbers, ...extras];
}

function statusOf(p: PlayerView, view: RoomView, turn: boolean): { text: string; tone: 'go' | 'warn' | 'dim' | 'ok' } {
  if (p.eliminated) return { text: 'Out of chips', tone: 'dim' };
  if (p.folded) return { text: p.foldedBy === 'forfeit' ? 'Forfeited' : p.foldedBy === 'timeout' ? 'Sitting out' : 'Folded', tone: 'dim' };
  if (!p.connected && !p.isBot) return { text: 'Away', tone: 'warn' };
  if (view.phase === 'equation') return p.submitted ? { text: 'Locked in', tone: 'ok' } : { text: 'Building', tone: 'dim' };
  if (view.pendingSwap?.playerId === p.id) return { text: 'Choosing a swap', tone: 'go' };
  if (turn) return { text: p.isBot ? 'Thinking' : 'To act', tone: 'go' };
  if (p.allIn) return { text: 'All in', tone: 'ok' };
  return { text: ' ', tone: 'dim' };
}

const toneClass = { go: 'text-felt-accent', warn: 'text-danger', dim: 'text-felt-muted', ok: 'text-felt-accent' } as const;

/** a vector in pixels, used for the flight animations */
interface Vec {
  x: number;
  y: number;
}

/* -------------------------------------------------------------------- plate */

/** cards are dealt out from the middle of the table; with reduced motion they simply appear */
function Dealt({ from, i, children }: { from: Vec | null; i: number; children: ReactNode }) {
  if (!from) return <span className="inline-flex">{children}</span>;
  return (
    <motion.span
      className="inline-flex"
      initial={{ opacity: 0, x: from.x, y: from.y, scale: 0.5 }}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 24, delay: Math.min(i, 5) * 0.05 }}
    >
      {children}
    </motion.span>
  );
}

function CardsAtSeat({ p, dim, dealFrom }: { p: PlayerView; dim: boolean; dealFrom: Vec | null }) {
  const dealt = dealtCards(p);
  if (dealt.length === 0 && p.ops.length === 0) return null;

  return (
    <>
      {/* phones: tiny cards, enough to read the numbers and spot a multiply or square root */}
      <div className={cn('mt-1.5 flex max-w-[96px] flex-wrap justify-center gap-0.5 md:hidden', dim && 'opacity-40')}>
        {dealt.map((c, i) => (
          <Dealt key={c.id} i={i} from={dealFrom}>
            <PlayingCard card={c} size="xxs" />
          </Dealt>
        ))}
      </div>
      {/* larger screens: the cards fan out in front of the seat */}
      <div className={cn('mt-2 hidden items-center gap-2 md:flex', dim && 'opacity-40')}>
        <div className="flex">
          {dealt.map((c, i) => (
            <span key={c.id} className={i > 0 ? '-ml-2.5' : ''} style={{ transform: `rotate(${(i - (dealt.length - 1) / 2) * 3}deg)` }}>
              <Dealt i={i} from={dealFrom}>
                <PlayingCard card={c} size="xs" />
              </Dealt>
            </span>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-0.5 font-mono text-[11px] text-felt-muted" aria-label="Operations held">
          {p.ops.map((o) => (
            <span key={o.id} className="grid size-[18px] place-items-center rounded-full bg-black/30 ring-1 ring-white/10">
              {OP_SYMBOL[o.op]}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

function SeatPlate({
  p,
  view,
  hero,
  onOpen,
  dealFrom,
}: {
  p: PlayerView;
  view: RoomView;
  hero?: boolean;
  onOpen: (id: string) => void;
  dealFrom: Vec | null;
}) {
  const turn = view.turn === p.id || view.pendingSwap?.playerId === p.id;
  const out = p.folded || p.eliminated;
  const status = statusOf(p, view, turn);
  const won = view.phase === 'ended' ? (view.result?.payouts[p.id] ?? 0) : 0;

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={() => onOpen(p.id)}
        aria-label={`${p.name}${hero ? ' (you)' : ''}, ${chips(p.chips)} chips${p.bet > 0 && !p.folded ? `, bet ${chips(p.bet)}` : ''}, ${status.text.trim() || 'waiting'}. Show cards.`}
        className={cn(
          'plate relative w-[78px] rounded-xl px-1 pb-1 pt-[22px] text-center transition-[box-shadow,transform] duration-500 ease-out-expo hover:-translate-y-0.5 md:w-[140px] md:rounded-2xl md:px-1.5 md:pb-1.5 md:pt-[28px]',
          out && 'opacity-60',
          turn && 'shadow-[0_0_0_2px_var(--felt-accent),0_10px_20px_-10px_rgb(0_0_0/0.8)]',
        )}
      >
        {turn && <span aria-hidden className="turn-ring pointer-events-none absolute -inset-1 rounded-[20px] ring-2 ring-felt-accent/70" />}
        <span className="absolute -top-4 left-1/2 -translate-x-1/2 md:-top-5">
          <Avatar name={p.name} bot={p.isBot} size={36} ring={turn} onFelt />
        </span>
        <span className="flex items-center justify-center gap-1">
          <span className="truncate text-xs font-semibold leading-tight md:text-sm">{p.name}</span>
          {p.isHost && <CrownSimpleIcon size={12} weight="fill" className="shrink-0 text-felt-muted" aria-label="Host" />}
        </span>
        <span className="mt-0.5 block font-mono text-xs font-semibold tabular md:text-sm">{chips(p.chips)}</span>
        <span className={cn('flex items-center justify-center gap-1 text-[11px] font-medium leading-4', toneClass[status.tone])}>
          {!p.connected && !p.isBot && !out && <WifiSlashIcon size={11} aria-hidden />}
          {status.text}
        </span>
        {/* phones: the bet is a small pill inside the plate, so nothing floats over the cramped table */}
        {BETTING_PHASES.includes(view.phase) && p.bet > 0 && !p.folded && (
          <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-black/45 py-0.5 pl-1 pr-2 font-mono text-[11px] font-semibold tabular md:hidden" aria-hidden>
            <Chip denom={chipBreakdown(p.bet)[0]?.denom ?? 1} size="xs" />
            {chips(p.bet)}
          </span>
        )}
        {won > 0 && (
          <span className="absolute -right-2 -top-3 rounded-full bg-felt-accent px-2 py-0.5 font-mono text-xs font-semibold tabular text-felt-accent-ink shadow-lg">
            +{chips(won)}
          </span>
        )}
      </button>
      {!hero && <CardsAtSeat p={p} dim={out} dealFrom={dealFrom} />}
    </div>
  );
}

function EmptySeat() {
  return (
    <div className="flex flex-col items-center gap-1 text-felt-muted" aria-hidden>
      <span className="grid size-11 place-items-center rounded-full border-2 border-dashed border-white/25">
        <UserPlusIcon size={16} />
      </span>
      <span className="hidden text-xs md:block">Open seat</span>
    </div>
  );
}

function PlayerSheet({ p, onClose, onKick }: { p: PlayerView | null; onClose: () => void; onKick?: (id: string) => void }) {
  const dealt = p ? dealtCards(p) : [];
  return (
    <Sheet open={!!p} onClose={onClose} labelledBy="player-sheet-title">
      {p && (
        <>
          <div className="flex items-center gap-3">
            <Avatar name={p.name} bot={p.isBot} size={48} />
            <div className="min-w-0 flex-1">
              <h2 id="player-sheet-title" className="truncate text-xl font-semibold tracking-tight">
                {p.name}
              </h2>
              <p className="text-sm text-muted">
                <span className="font-mono text-ink">{chips(p.chips)}</span> chips
                {p.bet > 0 && !p.folded ? (
                  <>
                    , bet <span className="font-mono text-ink">{chips(p.bet)}</span>
                  </>
                ) : null}
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2.5">
            {dealt.length === 0 ? <p className="text-sm text-muted">No cards yet.</p> : dealt.map((c) => <PlayingCard key={c.id} card={c} size="md" />)}
          </div>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {p.ops.map((o: OpCard) => (
              <PlayingCard key={o.id} card={o} size="md" />
            ))}
          </div>
          {dealt.length > 0 && <p className="mt-4 text-xs text-faint">Their first number is hidden until the showdown.</p>}
          {onKick && (
            <Button
              variant="danger"
              className="mt-5 w-full"
              onClick={() => {
                onKick(p.id);
                onClose();
              }}
            >
              Remove {p.name} from the table
            </Button>
          )}
        </>
      )}
    </Sheet>
  );
}

/* -------------------------------------------------------------------- table */

function Centre({ view }: { view: RoomView }) {
  const { title, sub } = headline(view);
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 flex w-[52%] -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center text-felt-ink">
      <span className="font-mono text-[10px] tracking-[0.35em] text-felt-muted/80 md:text-xs" aria-hidden>
        1 &nbsp;&middot;&nbsp; 20
      </span>
      <div className="mt-2 flex items-end gap-2.5">
        {view.pot > 0 ? (
          <ChipStack amount={view.pot} size="md" label={false} />
        ) : (
          <CoinsIcon size={22} weight="duotone" className="mb-1 text-felt-accent" aria-hidden />
        )}
        <AnimatedNumber value={view.pot} className="font-mono text-3xl font-semibold tabular leading-none tracking-tight md:text-5xl" />
      </div>
      <span className="mt-1 text-[11px] text-felt-muted">pot</span>
      {/* on a phone the seat plates and the dock already say who acts, and the room is needed for chips */}
      <h2 className="max-md:sr-only mt-2 text-sm font-semibold leading-tight md:mt-3 md:text-xl">{title}</h2>
      {sub && <p className="mt-0.5 hidden max-w-[34ch] text-xs leading-snug text-felt-muted md:block">{sub}</p>}
    </div>
  );
}

interface Props {
  view: RoomView;
  /** replaces the pot and status in the middle (the lobby uses this) */
  centre?: ReactNode;
  /** extra empty seats to draw (the lobby) */
  emptySeats?: number;
  /** the host can remove a player from a plate's sheet (the lobby) */
  onKick?: (playerId: string) => void;
}

const BETTING_PHASES = ['preflop', 'betting1', 'betting2'];

export function PokerTable({ view, centre, emptySeats = 0, onKick }: Props) {
  const reduce = useReducedMotion();
  const desktop = useMedia('(min-width: 768px)');
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [open, setOpen] = useState<string | null>(null);

  // one measurement drives every flight animation, so they stay in step with the layout
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBox({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hero = view.players.find((p) => p.id === view.you);
  const others = hero ? view.players.filter((p) => p.id !== view.you) : view.players;
  const total = others.length + emptySeats;
  const slots = seatSlots(total, !!hero);
  const seatsAround = total + (hero ? 1 : 0);

  const slotFor = (id: string): SeatSlot | undefined => (id === hero?.id ? HERO_SLOT : slots[others.findIndex((p) => p.id === id)]);
  const at = (s: SeatSlot): Point => (desktop ? s.d : s.m);
  /** pixel vector from point a to point b (both in table percentages) */
  const vec = (a: Point, b: Point): Vec => ({ x: ((b.x - a.x) / 100) * box.w, y: ((b.y - a.y) / 100) * box.h });
  const CENTRE: Point = { x: 50, y: 50 };
  const flights = !reduce && box.w > 0;

  const place = (slot: SeatSlot): CSSProperties =>
    ({ '--dx': `${slot.d.x}%`, '--dy': `${slot.d.y}%`, '--mx': `${slot.m.x}%`, '--my': `${slot.m.y}%` }) as CSSProperties;
  const seatClass =
    'absolute -translate-x-1/2 -translate-y-1/2 left-[var(--mx)] top-[var(--my)] md:left-[var(--dx)] md:top-[var(--dy)]';

  const betting = BETTING_PHASES.includes(view.phase);
  const round = view.phase === 'preflop' ? 0 : view.phase === 'betting1' ? 1 : 2;
  const winners = view.phase === 'ended' && view.result ? Object.entries(view.result.payouts).filter(([, amount]) => amount > 0) : [];
  // the table remounts after the equation round; cards that were already dealt must not be "dealt" again
  const dealing = betting || view.phase === 'dealing1' || view.phase === 'dealing2';

  return (
    <div
      ref={boxRef}
      className="table-box relative mx-auto mt-8 w-full max-w-[940px]"
      style={{ '--ma': portraitAspect(seatsAround), '--da': landscapeAspect(seatsAround) } as CSSProperties}
    >
      <div aria-hidden className="rail absolute inset-0 rounded-[50%]" />
      <div aria-hidden className="felt absolute inset-3 rounded-[50%] md:inset-7" />
      {centre ?? <Centre view={view} />}

      {/* bets on larger screens: chips in front of each seat, swept into the pot when the round closes */}
      <div className="pointer-events-none absolute inset-0 hidden md:block" aria-hidden>
        <AnimatePresence>
          {betting &&
            view.players
              .filter((p) => p.bet > 0)
              .map((p) => {
                const slot = slotFor(p.id);
                if (!slot) return null;
                const seat = at(slot);
                const here = towardCentre(seat, 0.42);
                const fromSeat = vec(here, seat);
                const toPot = vec(here, CENTRE);
                return (
                  <motion.div
                    key={`${view.hand}-${round}-${p.id}`}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${here.x}%`, top: `${here.y}%` }}
                    initial={flights ? { opacity: 0, x: fromSeat.x, y: fromSeat.y, scale: 0.6 } : { opacity: 0 }}
                    animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                    exit={flights ? { opacity: 0, x: toPot.x, y: toPot.y, scale: 0.55 } : { opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 26 }}
                  >
                    <ChipStack amount={p.bet} size="sm" />
                  </motion.div>
                );
              })}
        </AnimatePresence>
      </div>

      <ul aria-label="Players at the table" className="absolute inset-0 m-0 list-none p-0">
        {hero && (
          <li className={seatClass} style={place(HERO_SLOT)}>
            <SeatPlate p={hero} view={view} hero onOpen={setOpen} dealFrom={null} />
          </li>
        )}
        {others.map((p, i) => (
          <li key={p.id} className={seatClass} style={place(slots[i])}>
            <SeatPlate p={p} view={view} onOpen={setOpen} dealFrom={flights && dealing ? vec(at(slots[i]), CENTRE) : null} />
          </li>
        ))}
        {Array.from({ length: emptySeats }).map((_, i) => (
          <li key={`empty-${i}`} className={seatClass} style={place(slots[others.length + i])}>
            <EmptySeat />
          </li>
        ))}
      </ul>

      {/* the pot goes to whoever won it */}
      {flights && (
        <div className="pointer-events-none absolute inset-0">
          {winners.map(([id, amount]) => {
            const slot = slotFor(id);
            if (!slot) return null;
            const to = vec(CENTRE, at(slot));
            return (
              <motion.div
                key={`${view.hand}-win-${id}`}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                animate={{ opacity: [1, 1, 0], x: to.x, y: to.y, scale: [1, 1, 0.7] }}
                transition={{ duration: 1, delay: 0.25, ease: [0.32, 0.72, 0, 1] }}
              >
                <ChipStack amount={Math.min(amount, 1000)} size="sm" label={false} />
              </motion.div>
            );
          })}
        </div>
      )}

      <PlayerSheet
        p={view.players.find((p) => p.id === open) ?? null}
        onClose={() => setOpen(null)}
        onKick={open && open !== view.you ? onKick : undefined}
      />
    </div>
  );
}
