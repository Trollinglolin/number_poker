import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowFatLinesUpIcon, ArrowRightIcon, HandshakeIcon, MinusIcon, PlusIcon, ProhibitIcon, TrophyIcon } from '../lib/icons';
import type { Command, PlayerView, RoomView } from '@numberpoker/shared';
import { chips, cn } from '../lib/format';
import { Button } from './ui';
import { PlayingCard } from './cards';

interface Props {
  view: RoomView;
  send: (c: Command) => Promise<boolean>;
}

/** fixed to the bottom of the screen: betting controls, or the "deal next hand" button */
export function ActionDock({ view, send }: Props) {
  const me = view.players.find((p) => p.id === view.you);
  if (!me) return null;

  const betting = view.phase === 'preflop' || view.phase === 'betting1' || view.phase === 'betting2';
  const inHand = !me.folded && !me.eliminated;

  let body: React.ReactNode = null;
  if (view.phase === 'ended') body = <NextHand view={view} send={send} />;
  else if (betting && inHand) {
    body = view.betting && view.turn === me.id ? <BetControls view={view} send={send} /> : <Waiting view={view} />;
  }
  if (!body) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
      <div className="pointer-events-auto mx-auto w-full max-w-2xl rounded-[28px] bg-bg/80 p-1.5 ring-1 ring-line-strong backdrop-blur-xl shadow-[var(--shadow)]">
        <div className="rounded-[22px] bg-surface/90 p-3">
          {/* on a phone a full table pushes your own cards off screen, so they ride along in the dock */}
          {inHand && <MiniHand me={me} />}
          {body}
        </div>
      </div>
    </div>
  );
}

function MiniHand({ me }: { me: PlayerView }) {
  const numbers = me.cards.filter((c) => c.kind === 'number');
  const others = [...me.cards.filter((c) => c.kind === 'op'), ...me.ops];
  if (numbers.length === 0) return null;
  return (
    <div className="mb-3 flex items-end justify-center gap-3 md:hidden" aria-label="Your cards" role="group">
      <div className="flex gap-1.5">
        {numbers.map((c) => (
          <PlayingCard key={c.id} card={c} size="sm" />
        ))}
      </div>
      <div className="flex gap-1">
        {others.map((c) => (
          <PlayingCard key={c.id} card={c} size="xs" />
        ))}
      </div>
    </div>
  );
}

function Waiting({ view }: { view: RoomView }) {
  const who = view.players.find((p) => p.id === view.turn)?.name;
  return (
    <p className="px-2 py-2.5 text-center text-sm text-muted" role="status">
      {who ? `Waiting for ${who} to act...` : 'Waiting for the table...'}
    </p>
  );
}

function BetControls({ view, send }: Props) {
  const b = view.betting!;
  const [raising, setRaising] = useState(false);
  const [amount, setAmount] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const canRaise = b.maxRaise >= 1;

  // a new turn starts with the controls closed
  useEffect(() => {
    setRaising(false);
    setAmount(Math.min(Math.max(1, Math.round(view.pot / 2)), Math.max(1, b.maxRaise)));
  }, [view.turn, view.phase, view.currentBet, view.pot, b.maxRaise]);

  async function run(key: string, cmd: Command) {
    setBusy(key);
    await send(cmd);
    setBusy(null);
  }

  const clamp = (n: number) => Math.min(b.maxRaise, Math.max(1, Math.round(n || 1)));
  const presets: { label: string; value: number }[] = [
    { label: 'Min', value: 1 },
    { label: 'Half pot', value: Math.round(view.pot / 2) },
    { label: 'Pot', value: view.pot },
    { label: 'Max', value: b.maxRaise },
  ];

  return (
    <div className="space-y-3">
      <AnimatePresence initial={false}>
        {raising && canRaise && (
          <motion.div
            key="raise"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className="space-y-3 rounded-2xl bg-surface-2 p-3.5"
          >
            <div className="flex items-center gap-3">
              <button
                aria-label="Decrease raise"
                onClick={() => setAmount(clamp(amount - 1))}
                className="grid size-10 place-items-center rounded-full bg-surface-3 ring-1 ring-line-strong"
              >
                <MinusIcon size={16} />
              </button>
              <div className="flex-1 text-center">
                <label htmlFor="raise-amount" className="text-xs text-muted">
                  Raise by
                </label>
                <input
                  id="raise-amount"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(clamp(Number(e.target.value.replace(/\D/g, ''))))}
                  className="block w-full bg-transparent text-center font-mono text-3xl font-semibold tabular outline-none"
                />
              </div>
              <button
                aria-label="Increase raise"
                onClick={() => setAmount(clamp(amount + 1))}
                className="grid size-10 place-items-center rounded-full bg-surface-3 ring-1 ring-line-strong"
              >
                <PlusIcon size={16} />
              </button>
            </div>
            {b.maxRaise > 1 && (
              <input
                aria-label="Raise amount"
                type="range"
                min={1}
                max={b.maxRaise}
                value={amount}
                onChange={(e) => setAmount(clamp(Number(e.target.value)))}
                className="w-full"
              />
            )}
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setAmount(clamp(p.value))}
                  className={cn(
                    'h-8 rounded-full px-3.5 text-xs font-medium ring-1 transition-colors',
                    amount === clamp(p.value) ? 'bg-ink text-bg ring-ink' : 'bg-surface-3 text-muted ring-line-strong hover:text-ink',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted">
              You put in <span className="font-mono text-ink">{chips(b.callAmount + amount)}</span>. The bet to match becomes{' '}
              <span className="font-mono text-ink">{chips(view.currentBet + amount)}</span>.
            </p>
            <Button
              variant="primary"
              className="w-full"
              loading={busy === 'raise'}
              onClick={() => run('raise', { type: 'raise', amount })}
              island={<ArrowFatLinesUpIcon size={16} weight="fill" />}
            >
              Raise by {chips(amount)}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2">
        <Button variant="danger" className="flex-none" loading={busy === 'fold'} onClick={() => run('fold', { type: 'fold' })}>
          <ProhibitIcon size={17} aria-hidden /> Fold
        </Button>
        <Button
          variant="primary"
          className="min-w-0 flex-1"
          loading={busy === 'call'}
          onClick={() => run('call', { type: 'call' })}
          island={<HandshakeIcon size={16} weight="fill" />}
        >
          {b.callAmount === 0 ? 'Check' : `Call ${chips(b.callAmount)}`}
        </Button>
        <Button
          variant="secondary"
          className="flex-none"
          disabled={!canRaise}
          aria-expanded={raising}
          title={canRaise ? undefined : 'Nobody can be raised further right now'}
          onClick={() => setRaising((r) => !r)}
        >
          Raise
        </Button>
      </div>
    </div>
  );
}

function NextHand({ view, send }: Props) {
  const [busy, setBusy] = useState(false);
  const me = view.players.find((p) => p.id === view.you)!;
  const isHost = view.hostId === view.you;
  const winner = view.players.find((p) => p.id === view.matchWinnerId);

  if (winner) {
    return (
      <div className="flex flex-col items-center gap-3 px-2 py-1 text-center sm:flex-row sm:text-left">
        <div className="flex flex-1 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
            <TrophyIcon size={22} weight="fill" aria-hidden />
          </span>
          <div>
            <div className="font-semibold tracking-tight">{winner.name} wins the match</div>
            <div className="text-sm text-muted">They hold every chip at the table.</div>
          </div>
        </div>
        {isHost ? (
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await send({ type: 'reset' });
              setBusy(false);
            }}
          >
            Reset chips and play again
          </Button>
        ) : (
          <span className="text-sm text-muted">Waiting for the host to start a new match.</span>
        )}
      </div>
    );
  }

  if (me.eliminated) {
    return <p className="px-2 py-2.5 text-center text-sm text-muted">You are out of chips. The next hand will start without you.</p>;
  }

  return (
    <Button
      variant="primary"
      size="lg"
      className="w-full justify-between"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await send({ type: 'start' });
        setBusy(false);
      }}
      island={<ArrowRightIcon size={18} weight="bold" />}
    >
      Deal next hand
    </Button>
  );
}
