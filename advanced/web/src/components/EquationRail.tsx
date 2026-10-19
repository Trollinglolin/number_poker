import type { RoomView } from '@numberpoker/shared';
import { CheckCircleIcon, CoinsIcon } from '../lib/icons';
import { cn } from '../lib/format';
import { AnimatedNumber } from './AnimatedNumber';
import { Avatar } from './ui';

/**
 * While everyone builds equations the full table is not needed, so it shrinks to a rail:
 * the pot, and who has locked in. Gives the builder the screen.
 */
export function EquationRail({ view }: { view: RoomView }) {
  const players = view.players.filter((p) => !p.eliminated);
  return (
    <section
      aria-label="Equation round"
      className="rounded-[28px] px-4 py-4 text-felt-ink ring-1 ring-white/10 md:px-6"
      style={{ background: 'radial-gradient(110% 140% at 50% 0%, #1b6e4d 0%, #10513a 55%, #0b3426 100%)' }}
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2.5">
          <CoinsIcon size={22} weight="duotone" className="text-felt-accent" aria-hidden />
          <AnimatedNumber value={view.pot} className="font-mono text-2xl font-semibold tabular" />
          <span className="text-xs text-felt-muted">pot</span>
        </div>
        <ul className="flex flex-1 flex-wrap items-center gap-x-5 gap-y-2" aria-label="Who has locked in">
          {players.map((p) => {
            const state = p.folded ? (p.foldedBy === 'forfeit' ? 'Forfeited' : 'Folded') : p.submitted ? 'Locked in' : 'Building';
            return (
              <li key={p.id} className={cn('flex items-center gap-2', p.folded && 'opacity-55')}>
                <Avatar name={p.name} bot={p.isBot} size={30} />
                <span className="text-sm font-medium">{p.id === view.you ? 'You' : p.name}</span>
                <span className={cn('inline-flex items-center gap-1 text-xs', p.submitted ? 'text-felt-accent' : 'text-felt-muted')}>
                  {p.submitted && <CheckCircleIcon size={14} weight="fill" aria-hidden />}
                  {state}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
