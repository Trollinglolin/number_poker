import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { Command, RoomView } from '@numberpoker/shared';
import { EyeIcon } from '../lib/icons';
import { game } from '../lib/client';
import { ActionDock } from '../components/ActionDock';
import { EquationBuilder } from '../components/EquationBuilder';
import { EquationRail } from '../components/EquationRail';
import { Header } from '../components/Header';
import { HoleCards } from '../components/HoleCards';
import { PokerTable } from '../components/PokerTable';
import { Showdown } from '../components/Showdown';
import { SwapSheet } from '../components/SwapSheet';
import { Button, Sheet, useToast } from '../components/ui';

/** the latest thing that happened, under the table */
function EventLine({ view }: { view: RoomView }) {
  const last = view.log[view.log.length - 1];
  return (
    <div className="h-6 text-center text-[13px] leading-6 text-muted" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={last?.seq ?? 0}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          className="block truncate"
        >
          {last?.text ?? 'Good luck.'}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

export function Table({ view }: { view: RoomView }) {
  const toast = useToast();
  const reduce = useReducedMotion();
  const [leaving, setLeaving] = useState(false);
  const showdownRef = useRef<HTMLDivElement>(null);

  const send = useCallback(
    async (cmd: Command) => {
      const res = await game.command(cmd);
      if (!res.ok) toast(res.error, 'error');
      return res.ok;
    },
    [toast],
  );

  const me = view.players.find((p) => p.id === view.you);
  const inHand = !!me && !me.folded && !me.eliminated;
  const betting = view.phase === 'preflop' || view.phase === 'betting1' || view.phase === 'betting2';
  const dockVisible = view.phase === 'ended' || (betting && inHand);
  const building = view.phase === 'equation' && inHand;

  // bring the result into view when a hand ends
  useEffect(() => {
    if (view.phase === 'ended') showdownRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [view.phase, view.hand, reduce]);

  return (
    <div className="flex min-h-dvh flex-col">
      <Header view={view} onLeave={() => setLeaving(true)} />

      <main id="main" className={`mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-2 pt-4 md:gap-5 md:px-4 ${dockVisible ? 'pb-44' : 'pb-10'}`}>
        {view.isSpectator && (
          <div className="mx-2 flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted ring-1 ring-line md:mx-0">
            <EyeIcon size={18} aria-hidden />
            You are watching this table. You can join the next match when the host resets it.
          </div>
        )}

        {view.phase === 'equation' ? <EquationRail view={view} /> : <PokerTable view={view} />}
        <EventLine view={view} />

        {view.phase === 'ended' && (
          <div ref={showdownRef} className="mx-1 scroll-mt-32 md:mx-0">
            <Showdown view={view} />
          </div>
        )}

        {me && building && (
          <div className="mx-1 md:mx-0">
            <EquationBuilder key={view.hand} me={me} send={send} />
          </div>
        )}
        {me && view.phase === 'equation' && !inHand && (
          <p className="mx-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted ring-1 ring-line md:mx-0">
            You are out of this hand. The remaining players are building their equations.
          </p>
        )}

        {me && !building && <HoleCards me={me} view={view} />}
      </main>

      <ActionDock view={view} send={send} />
      <SwapSheet view={view} send={send} />

      <Sheet open={leaving} onClose={() => setLeaving(false)} labelledBy="leave-title">
        <h2 id="leave-title" className="text-xl font-semibold tracking-tight">
          Leave this table?
        </h2>
        <p className="mt-2 text-sm text-muted">
          {me && !me.folded && view.phase !== 'waiting' && view.phase !== 'ended'
            ? 'Your hand is folded and your seat is given up.'
            : 'Your seat is given up. You can rejoin with the table code if there is room.'}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setLeaving(false)}>
            Stay
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              setLeaving(false);
              await game.leave();
            }}
          >
            Leave table
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
