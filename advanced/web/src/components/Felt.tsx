import { useEffect } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { CoinsIcon } from '../lib/icons';
import type { RoomView } from '@numberpoker/shared';
import { chips } from '../lib/format';

export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => chips(Math.round(v)));
  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 0.7, ease: [0.32, 0.72, 0, 1] });
    return () => controls.stop();
  }, [value, reduce, mv]);
  return <motion.span className={className}>{text}</motion.span>;
}

function headline(view: RoomView): { title: string; sub: string } {
  const name = (id: string | null) => view.players.find((p) => p.id === id)?.name ?? 'Someone';
  const me = view.you;
  if (view.pendingSwap) {
    return view.pendingSwap.playerId === me
      ? { title: 'Choose your swap', sub: 'You drew a multiply card.' }
      : { title: `${name(view.pendingSwap.playerId)} drew a multiply`, sub: 'Dealing resumes after their choice.' };
  }
  switch (view.phase) {
    case 'preflop':
    case 'betting1':
    case 'betting2': {
      const round = view.phase === 'preflop' ? 'First' : view.phase === 'betting1' ? 'Second' : 'Final';
      const sub = view.pot === 0 ? `${round} betting round. The pot is empty, raise to play for chips.` : `${round} betting round`;
      if (view.turn === me) return { title: 'Your move', sub };
      return { title: `${name(view.turn)} to act`, sub };
    }
    case 'dealing1':
    case 'dealing2':
      return { title: 'Dealing', sub: 'Cards are on their way.' };
    case 'equation': {
      const live = view.players.filter((p) => !p.folded && !p.eliminated);
      const done = live.filter((p) => p.submitted).length;
      return { title: 'Equation round', sub: `${done} of ${live.length} locked in` };
    }
    case 'ended':
      return { title: 'Hand complete', sub: view.result?.kind === 'showdown' ? 'Equations revealed' : '' };
    default:
      return { title: 'Waiting', sub: '' };
  }
}

export function Felt({ view }: { view: RoomView }) {
  const { title, sub } = headline(view);
  const lastEvent = view.log[view.log.length - 1];
  return (
    <section
      aria-label="Table"
      className="relative overflow-hidden rounded-[28px] ring-1 ring-line-strong"
      style={{ background: 'var(--felt)' }}
    >
      <div className="grid gap-4 px-5 py-6 md:grid-cols-[1fr_auto_1fr] md:items-center md:px-8 md:py-7">
        <div className="order-2 text-center md:order-1 md:text-left">
          <h2 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h2>
          {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
        </div>

        <div className="order-1 flex flex-col items-center md:order-2">
          <span className="text-xs font-medium text-muted">Pot</span>
          <div className="mt-1 flex items-center gap-2.5">
            <CoinsIcon size={26} weight="duotone" className="text-accent" aria-hidden />
            <AnimatedNumber value={view.pot} className="font-mono text-4xl font-semibold tabular tracking-tight md:text-5xl" />
          </div>
        </div>

        <div className="order-3 hidden text-right md:block">
          {view.currentBet > 0 && (view.phase === 'preflop' || view.phase === 'betting1' || view.phase === 'betting2') ? (
            <>
              <div className="text-xs font-medium text-muted">Bet to match</div>
              <div className="font-mono text-2xl font-semibold tabular">{chips(view.currentBet)}</div>
            </>
          ) : (
            <>
              <div className="text-xs font-medium text-muted">Hand</div>
              <div className="font-mono text-2xl font-semibold tabular">{view.hand}</div>
            </>
          )}
        </div>
      </div>

      <div className="h-8 border-t border-line bg-black/10 px-5 text-center text-[13px] leading-8 text-muted md:px-8 md:text-left">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={lastEvent?.seq ?? 0}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="block truncate"
          >
            {lastEvent?.text ?? 'Good luck.'}
          </motion.span>
        </AnimatePresence>
      </div>
    </section>
  );
}
