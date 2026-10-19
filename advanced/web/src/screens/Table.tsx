import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { Command, RoomView } from '@numberpoker/shared';
import { EyeIcon } from '../lib/icons';
import { game } from '../lib/client';
import { useMedia } from '../lib/useMedia';
import { ActionDock, ActionPanel } from '../components/ActionDock';
import { EquationBuilder } from '../components/EquationBuilder';
import { EquationRail } from '../components/EquationRail';
import { EventLog } from '../components/EventLog';
import { Header } from '../components/Header';
import { HoleCards } from '../components/HoleCards';
import { PokerTable } from '../components/PokerTable';
import { Showdown } from '../components/Showdown';
import { SwapSheet } from '../components/SwapSheet';
import { Button, Sheet, useToast } from '../components/ui';

/** the latest thing that happened, under the table (phones and tablets; desktop has the full log) */
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
  // a normal computer screen gets one fixed-height screen with a side panel; phones and tablets scroll
  const wide = useMedia('(min-width: 1024px)');
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

  // bring the result into view when a hand ends (the desktop side panel shows it at the top already)
  useEffect(() => {
    if (!wide && view.phase === 'ended') showdownRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [view.phase, view.hand, reduce, wide]);

  const spectatorNote = view.isSpectator && (
    <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-2.5 text-sm text-muted ring-1 ring-line">
      <EyeIcon size={18} aria-hidden />
      You are watching this table. You can join the next match when the host resets it.
    </div>
  );

  const outNote = me && view.phase === 'equation' && !inHand && (
    <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted ring-1 ring-line">
      You are out of this hand. The remaining players are building their equations.
    </p>
  );

  const sheets = (
    <>
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
    </>
  );

  if (wide) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden">
        <Header view={view} onLeave={() => setLeaving(true)} />
        <main id="main" className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_340px] gap-5 px-5 pb-4 pt-1">
          <section className="flex min-h-0 min-w-0 flex-col gap-2">
            {spectatorNote}
            {view.phase === 'equation' ? (
              <>
                <EquationRail view={view} />
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {me && building && <EquationBuilder key={view.hand} me={me} send={send} wide />}
                  {outNote}
                </div>
              </>
            ) : (
              <>
                <div className="fit-parent flex-1">
                  <PokerTable view={view} fit />
                </div>
                {me && <HoleCards me={me} view={view} row />}
              </>
            )}
          </section>

          <aside aria-label="Actions and history" className="flex min-h-0 flex-col gap-3 overflow-y-auto px-0.5 pb-1 pt-1">
            <ActionPanel view={view} send={send} />
            {view.phase === 'ended' && <Showdown view={view} />}
            <EventLog view={view} className="min-h-[150px] flex-1" />
          </aside>
        </main>
        {sheets}
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Header view={view} onLeave={() => setLeaving(true)} />

      <main id="main" className={`mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-2 pt-4 md:gap-5 md:px-4 ${dockVisible ? 'pb-44' : 'pb-10'}`}>
        {spectatorNote && <div className="mx-2 md:mx-0">{spectatorNote}</div>}

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
        {outNote && <div className="mx-2 md:mx-0">{outNote}</div>}

        {me && !building && <HoleCards me={me} view={view} />}
      </main>

      <ActionDock view={view} send={send} />
      {sheets}
    </div>
  );
}
