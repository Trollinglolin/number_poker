import { motion } from 'motion/react';
import type { PlayerView, RoomView } from '@numberpoker/shared';
import { chips, cn } from '../lib/format';
import { Avatar } from './ui';
import { PlayingCard } from './cards';

function Deal({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -36, rotate: -6, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22, delay: Math.min(index, 8) * 0.07 }}
    >
      {children}
    </motion.div>
  );
}

export function MyHand({ me, view }: { me: PlayerView; view: RoomView }) {
  const numbers = me.cards.filter((c) => c.kind === 'number');
  const extras = me.cards.filter((c) => c.kind === 'op');
  const out = me.folded || me.eliminated;
  const turn = view.turn === me.id;

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
    <section
      aria-label="Your hand"
      className={cn(
        'relative rounded-[28px] bg-surface p-4 ring-1 transition-colors duration-500 ease-out-expo md:p-6',
        turn ? 'ring-accent/70' : 'ring-line-strong',
      )}
    >
      {turn && <span aria-hidden className="turn-ring pointer-events-none absolute -inset-[3px] rounded-[31px] ring-2 ring-accent/50" />}
      <div className="flex items-center gap-3">
        <Avatar name={me.name} bot={false} size={44} ring={turn} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold tracking-tight">{me.name} (you)</div>
          <div className="text-sm text-muted">
            {me.bet > 0 && !me.folded ? `Bet ${chips(me.bet)} this round` : 'Your cards'}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl font-semibold tabular">{chips(me.chips)}</div>
          <div className="text-xs text-faint">chips</div>
        </div>
      </div>

      {note ? (
        <p className="mt-4 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">{note}</p>
      ) : numbers.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
          Cards arrive after the first betting round.
        </p>
      ) : null}

      <div className={cn('mt-5 space-y-4', out && 'opacity-60')}>
        {numbers.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-medium text-muted">Numbers</div>
            <div className="flex flex-wrap gap-2.5 pt-1.5">
              {numbers.map((c, i) => (
                <Deal key={c.id} index={i}>
                  <PlayingCard card={c} size="lg" />
                </Deal>
              ))}
            </div>
            <p className="mt-2.5 text-xs text-faint">The first number you were dealt stays hidden from the other players.</p>
          </div>
        )}
        <div>
          <div className="mb-2 text-xs font-medium text-muted">Operations</div>
          <div className="flex flex-wrap gap-2.5">
            {[...extras, ...me.ops].map((c, i) => (
              <Deal key={c.id} index={i + numbers.length}>
                <PlayingCard card={c} size="md" />
              </Deal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
