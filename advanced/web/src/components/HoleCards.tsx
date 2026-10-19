import { motion } from 'motion/react';
import type { PlayerView, RoomView } from '@numberpoker/shared';
import { cn } from '../lib/format';
import { PlayingCard } from './cards';

function Deal({ index, rotate, children }: { index: number; rotate: number; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -48, rotate: rotate - 10, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, rotate, scale: 1 }}
      transition={{ type: 'spring', stiffness: 240, damping: 22, delay: Math.min(index, 8) * 0.08 }}
    >
      {children}
    </motion.div>
  );
}

/** my cards, held in front of me under the table */
export function HoleCards({ me, view }: { me: PlayerView; view: RoomView }) {
  const numbers = me.cards.filter((c) => c.kind === 'number');
  const extras = me.cards.filter((c) => c.kind === 'op');
  const out = me.folded || me.eliminated;

  const note = me.eliminated
    ? 'You are out of chips. You can keep watching.'
    : me.folded
      ? me.foldedBy === 'forfeit'
        ? 'Your cards could not make a valid equation, so you forfeited this hand.'
        : me.foldedBy === 'timeout'
          ? 'You were away, so you are sitting this hand out.'
          : 'You folded this hand.'
      : null;

  return (
    <section aria-label="Your hand" className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4">
      {note && <p className="rounded-full bg-surface-2 px-4 py-2 text-sm text-muted ring-1 ring-line">{note}</p>}

      <div className={cn('flex flex-col items-center gap-5', out && 'opacity-55')}>
        {numbers.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong px-6 py-5 text-center text-sm text-muted">
            Number cards arrive after the first betting round.
          </p>
        ) : (
          <div>
            <div className="flex items-end justify-center -space-x-1.5 pt-2 sm:-space-x-1" aria-label="Your number cards" role="group">
              {numbers.map((c, i) => (
                <Deal key={c.id} index={i} rotate={(i - (numbers.length - 1) / 2) * 3.5}>
                  <PlayingCard card={c} size="lg" />
                </Deal>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-faint">The first number you were dealt stays hidden from the other players.</p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2.5" aria-label="Your operations" role="group">
          {[...extras, ...me.ops].map((c, i) => (
            <Deal key={c.id} index={i + numbers.length} rotate={0}>
              <PlayingCard card={c} size="md" />
            </Deal>
          ))}
        </div>
      </div>
    </section>
  );
}
