import { useMemo, useRef, useState } from 'react';
import { Reorder, motion } from 'motion/react';
import { CheckCircleIcon, LockSimpleIcon } from '../lib/icons';
import { analyze } from '@numberpoker/shared';
import type { BetType, Card, Command, PlayerView } from '@numberpoker/shared';
import { cn, value as fmt } from '../lib/format';
import { Button, Panel, useToast } from './ui';
import { CardButton } from './cards';

type Pool = 'small' | 'big';
const TARGET: Record<Pool, number> = { small: 1, big: 20 };

const OPTIONS: { id: BetType; glyph: string; title: string; hint: string }[] = [
  { id: 'small', glyph: '1', title: 'Small', hint: 'Closest to 1' },
  { id: 'big', glyph: '20', title: 'Big', hint: 'Closest to 20' },
  { id: 'both', glyph: '1+20', title: 'Both', hint: 'Win both pools' },
];

interface Props {
  me: PlayerView;
  send: (c: Command) => Promise<boolean>;
}

export function EquationBuilder({ me, send }: Props) {
  const toast = useToast();
  const hand = useMemo<Card[]>(() => [...(me.cards.filter((c) => c.kind !== 'hidden') as Card[]), ...me.ops], [me.cards, me.ops]);
  const [betType, setBetType] = useState<BetType | null>(null);
  const [ids, setIds] = useState<Record<Pool, string[]>>({ small: [], big: [] });
  const [busy, setBusy] = useState(false);

  const byId = useMemo(() => new Map(hand.map((c) => [c.id, c])), [hand]);
  const analysisOf = (pool: Pool) =>
    analyze(
      ids[pool].map((id) => byId.get(id)!).filter(Boolean),
      hand.length,
    );
  const valid = (pool: Pool) => {
    const a = analysisOf(pool);
    return a.complete && a.problems.length === 0 && a.value !== null;
  };

  const pools: Pool[] = betType === 'both' ? ['small', 'big'] : betType ? [betType] : [];
  const canSubmit = betType !== null && pools.every(valid);

  async function submit() {
    if (!betType || !canSubmit) return;
    setBusy(true);
    const ok = await send({
      type: 'submit',
      betType,
      small: pools.includes('small') ? ids.small : undefined,
      big: pools.includes('big') ? ids.big : undefined,
    });
    setBusy(false);
    if (ok) toast('Equation locked in.');
  }

  if (me.submitted) {
    return (
      <Panel innerClassName="p-6 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent text-accent-ink">
          <LockSimpleIcon size={22} weight="fill" aria-hidden />
        </span>
        <h2 className="mt-3 text-xl font-semibold tracking-tight">Locked in</h2>
        <p className="mt-1 text-sm text-muted">Your equation stays secret until everyone has finished.</p>
      </Panel>
    );
  }

  return (
    <Panel innerClassName="p-4 md:p-6">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Build your equation</h2>
        <span className="text-sm text-muted">Use all {hand.length} cards</span>
      </div>
      <p className="max-w-[60ch] text-sm text-muted">
        Pick what you are going for, then tap your cards in order. Drag to reorder, tap a placed card to take it back.
      </p>

      <div role="radiogroup" aria-label="What are you betting on?" className="mt-5 grid grid-cols-3 gap-2.5">
        {OPTIONS.map((o) => {
          const on = betType === o.id;
          return (
            <button
              key={o.id}
              role="radio"
              aria-checked={on}
              onClick={() => setBetType(o.id)}
              className={cn(
                'rounded-2xl p-3 text-left ring-1 transition-[background-color,box-shadow,transform] duration-500 ease-out-expo active:scale-[0.98]',
                on ? 'bg-surface-3 ring-2 ring-accent' : 'bg-surface-2 ring-line-strong hover:bg-surface-3',
              )}
            >
              <div
                className={cn(
                  'font-mono text-xl font-semibold tabular',
                  o.id === 'small' ? 'text-small' : o.id === 'big' ? 'text-big' : 'text-ink',
                )}
              >
                {o.glyph}
              </div>
              <div className="mt-1.5 text-sm font-semibold leading-tight">{o.title}</div>
              <div className="text-xs leading-snug text-muted">{o.hint}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-5 space-y-6">
        {betType === null && (
          <p className="rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">
            Choose small, big or both to start building.
          </p>
        )}
        {pools.map((pool) => (
          <PoolBuilder
            key={pool}
            pool={pool}
            hand={hand}
            ids={ids[pool]}
            setIds={(next) => setIds((cur) => ({ ...cur, [pool]: next }))}
            analysis={analysisOf(pool)}
            showTitle={pools.length > 1}
          />
        ))}
      </div>

      {betType && (
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => setIds({ small: [], big: [] })}
            disabled={ids.small.length + ids.big.length === 0}
          >
            Clear all
          </Button>
          <Button
            variant="primary"
            size="lg"
            disabled={!canSubmit}
            loading={busy}
            onClick={submit}
            island={<LockSimpleIcon size={18} weight="bold" />}
            className="sm:min-w-[260px] sm:justify-between"
          >
            {betType === 'both' ? 'Lock in both equations' : 'Lock in equation'}
          </Button>
        </div>
      )}
    </Panel>
  );
}

function PoolBuilder({
  pool,
  hand,
  ids,
  setIds,
  analysis,
  showTitle,
}: {
  pool: Pool;
  hand: Card[];
  ids: string[];
  setIds: (ids: string[]) => void;
  analysis: ReturnType<typeof analyze>;
  showTitle: boolean;
}) {
  const target = TARGET[pool];
  const byId = useMemo(() => new Map(hand.map((c) => [c.id, c])), [hand]);
  const remaining = hand.filter((c) => !ids.includes(c.id));
  const dragging = useRef(false);
  const tone = pool === 'small' ? 'text-small' : 'text-big';

  const remove = (id: string) => setIds(ids.filter((x) => x !== id));
  const move = (id: string, delta: number) => {
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = ids.slice();
    [next[i], next[j]] = [next[j], next[i]];
    setIds(next);
  };

  const complete = analysis.complete && analysis.problems.length === 0 && analysis.value !== null;
  const message =
    analysis.problems[0] ??
    (ids.length === 0
      ? 'Start with a number card.'
      : remaining.length > 0
        ? `${remaining.length} ${remaining.length === 1 ? 'card' : 'cards'} left to place.`
        : null);

  return (
    <section aria-label={`${pool} equation`} className="space-y-3">
      {showTitle && (
        <h3 className={cn('text-sm font-semibold', tone)}>
          {pool === 'small' ? 'Small equation, closest to 1' : 'Big equation, closest to 20'}
        </h3>
      )}

      {/* the equation so far */}
      <div className="rounded-2xl bg-surface-2 p-3 ring-1 ring-line">
        {ids.length === 0 ? (
          <div className="grid h-[70px] place-items-center text-sm text-faint">Your equation appears here</div>
        ) : (
          <Reorder.Group
            as="ul"
            axis="x"
            values={ids}
            onReorder={setIds}
            layoutScroll
            className="scroll-hide flex gap-1.5 overflow-x-auto py-1"
          >
            {ids.map((id) => {
              const card = byId.get(id);
              if (!card) return null;
              return (
                <Reorder.Item
                  key={id}
                  as="li"
                  value={id}
                  className="shrink-0 list-none"
                  onDragStart={() => (dragging.current = true)}
                  onDragEnd={() => setTimeout(() => (dragging.current = false), 60)}
                  whileDrag={{ scale: 1.08, zIndex: 2 }}
                >
                  <CardButton
                    card={card}
                    size="sm"
                    aria-label={`${card.kind === 'number' ? card.value : card.op} placed. Press to remove, arrow keys to move.`}
                    onClick={() => !dragging.current && remove(id)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowLeft') (e.preventDefault(), move(id, -1));
                      else if (e.key === 'ArrowRight') (e.preventDefault(), move(id, 1));
                      else if (e.key === 'Backspace' || e.key === 'Delete') (e.preventDefault(), remove(id));
                    }}
                  />
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
        )}
      </div>

      {/* live result */}
      <div role="status" aria-live="polite" className="flex min-h-[3.25rem] items-center gap-3 px-1">
        {analysis.value !== null ? (
          <>
            <motion.span
              key={analysis.value}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn('font-mono text-3xl font-semibold tabular tracking-tight', tone)}
            >
              {fmt(analysis.value)}
            </motion.span>
            <span className="text-sm text-muted">
              {analysis.value === target ? (
                <span className="inline-flex items-center gap-1 font-medium text-accent">
                  <CheckCircleIcon size={16} weight="fill" aria-hidden /> Exactly {target}
                </span>
              ) : (
                <>
                  {fmt(Math.abs(analysis.value - target))} away from {target}
                </>
              )}
              {!complete && message ? <span className="ml-2 text-faint">{message}</span> : null}
            </span>
          </>
        ) : (
          <span className="text-sm text-muted">{message}</span>
        )}
      </div>

      {/* cards still in hand */}
      <div>
        {remaining.length === 0 ? (
          <p className="px-1 text-xs text-faint">All cards placed. Tap one in the equation to take it back.</p>
        ) : (
          <div aria-label="Cards still in your hand" role="group" className="flex flex-wrap gap-2">
            {remaining.map((c) => (
              <motion.div key={c.id} layout="position" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 30 }}>
                <CardButton card={c} size="md" onClick={() => setIds([...ids, c.id])} />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
