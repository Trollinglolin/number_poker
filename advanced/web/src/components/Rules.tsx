import { XIcon } from '../lib/icons';
import { Sheet } from './ui';
import { PlayingCard } from './cards';
import type { CardView } from '@numberpoker/shared';

const n = (value: number, color: 'gold' | 'silver' | 'bronze' | 'dark'): CardView => ({
  id: `r${value}${color}`,
  kind: 'number',
  value,
  color,
});
const op = (o: 'add' | 'subtract' | 'multiply' | 'divide' | 'sqrt'): CardView => ({ id: `r${o}`, kind: 'op', op: o });

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="space-y-2 text-[15px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export function RulesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} labelledBy="rules-title" wide>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 id="rules-title" className="text-2xl font-semibold tracking-tight">
            How to play
          </h2>
          <p className="mt-1 max-w-[52ch] text-sm text-muted">
            Win chips by building an equation that lands closest to 1 or to 20.
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close rules"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 ring-1 ring-line-strong hover:bg-surface-3"
        >
          <XIcon size={18} />
        </button>
      </div>

      <div className="space-y-6">
        <Section title="The cards">
          <p>
            The deck has four colours of number cards, 0 to 10: gold, silver, bronze and dark. It also holds four multiply cards and
            four square root cards. Everyone starts each hand with add, subtract and divide.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <PlayingCard card={n(7, 'gold')} size="sm" />
            <PlayingCard card={n(3, 'silver')} size="sm" />
            <PlayingCard card={n(9, 'bronze')} size="sm" />
            <PlayingCard card={n(0, 'dark')} size="sm" />
            <span className="mx-1 h-8 w-px bg-line-strong" />
            <PlayingCard card={op('add')} size="sm" />
            <PlayingCard card={op('subtract')} size="sm" />
            <PlayingCard card={op('divide')} size="sm" />
            <PlayingCard card={op('multiply')} size="sm" />
            <PlayingCard card={op('sqrt')} size="sm" />
          </div>
        </Section>

        <Section title="A hand">
          <ol className="list-decimal space-y-1.5 pl-5 marker:text-faint">
            <li>First betting round, before any cards are dealt.</li>
            <li>Everyone gets two number cards, then a second betting round.</li>
            <li>Everyone gets two more (four in total), then the final betting round.</li>
            <li>Everyone builds an equation, picks small, big or both, and locks it in.</li>
            <li>Equations are revealed and the pot is paid out.</li>
          </ol>
          <p>
            Betting works like Texas Hold&apos;em: fold, check or call, or raise. You can raise by at most the amount every other
            player can still match.
          </p>
        </Section>

        <Section title="Special cards">
          <p>
            <b className="font-medium text-ink">Square root.</b> It is an extra card, so you simply draw again and still end up with
            four number cards. It applies to the one number card right after it.
          </p>
          <p>
            <b className="font-medium text-ink">Multiply.</b> When you draw one you may trade your add or your subtract for it, or
            keep your cards and discard the multiply. You can only ever hold one. Divide cannot be traded.
          </p>
          <p>
            Only your first number card stays secret. Everything else on the table is visible to everyone.
          </p>
        </Section>

        <Section title="Building an equation">
          <p>
            Use every card you hold, once each. Start and end with a number, put an operator between numbers, and place a square root
            directly in front of a number. There are no brackets: multiply and divide happen before add and subtract. The result must
            be a real number (no dividing by zero).
          </p>
          <p>
            If your cards cannot make any valid equation, you forfeit the hand and your bets stay in the pot.
          </p>
        </Section>

        <Section title="Small, big, both">
          <p>
            <b className="font-medium text-small">Small</b> players compete for the closest to 1.{' '}
            <b className="font-medium text-big">Big</b> players compete for the closest to 20. If you bet{' '}
            <b className="font-medium text-ink">both</b>, you build two equations and must win both pools. If everyone picked the
            same side, the closest takes the whole pot. With a mix, the small and big winners split it, and a &quot;both&quot; bettor
            who wins only one pool loses that claim.
          </p>
          <p>
            Ties: for small, the lowest number card in your hand wins; for big, the highest. If those numbers match, colours decide
            (gold, silver, bronze, dark for big; the reverse for small).
          </p>
        </Section>
      </div>
    </Sheet>
  );
}
