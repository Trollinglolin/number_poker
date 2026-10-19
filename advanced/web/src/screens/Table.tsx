import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { EyeIcon } from '../lib/icons';
import type { Command, RoomView } from '@numberpoker/shared';
import { game } from '../lib/client';
import { ActionDock } from '../components/ActionDock';
import { EquationBuilder } from '../components/EquationBuilder';
import { Felt } from '../components/Felt';
import { Header } from '../components/Header';
import { MyHand } from '../components/MyHand';
import { Seat } from '../components/Seat';
import { Showdown } from '../components/Showdown';
import { SwapSheet } from '../components/SwapSheet';
import { Button, Sheet, useToast } from '../components/ui';

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
  const others = view.players.filter((p) => p.id !== view.you);
  const inHand = !!me && !me.folded && !me.eliminated;
  const betting = view.phase === 'preflop' || view.phase === 'betting1' || view.phase === 'betting2';
  const dockVisible = view.phase === 'ended' || (betting && inHand);

  // bring the result into view when a hand ends
  useEffect(() => {
    if (view.phase === 'ended') showdownRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [view.phase, view.hand, reduce]);

  return (
    <div className="flex min-h-dvh flex-col">
      <Header view={view} onLeave={() => setLeaving(true)} />

      <main
        className={`mx-auto grid w-full max-w-6xl flex-1 content-start gap-5 px-4 pt-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 ${dockVisible ? 'pb-44' : 'pb-10'}`}
      >
        {/* opponents: a swipeable row on phones, a sticky sidebar on large screens so they stay in view */}
        <aside aria-label="Players" className="lg:order-2 lg:sticky lg:top-[4.5rem] lg:self-start">
          <div className="scroll-hide -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 lg:grid-cols-1">
            {(view.isSpectator ? view.players : others).map((p) => (
              <Seat key={p.id} p={p} view={view} />
            ))}
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-5 lg:order-1 lg:gap-6">
          {view.isSpectator && (
            <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted ring-1 ring-line">
              <EyeIcon size={18} aria-hidden />
              You are watching this table. You can join the next match when the host resets it.
            </div>
          )}

          <Felt view={view} />

          {view.phase === 'ended' && (
            <div ref={showdownRef} className="scroll-mt-32">
              <Showdown view={view} />
            </div>
          )}

          {me && view.phase === 'equation' && inHand && <EquationBuilder key={view.hand} me={me} send={send} />}
          {me && view.phase === 'equation' && !inHand && (
            <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted ring-1 ring-line">
              You are out of this hand. The remaining players are building their equations.
            </p>
          )}

          {me && <MyHand me={me} view={view} />}
        </div>
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
