import { motion } from 'motion/react';
import { CrownSimpleIcon, TrophyIcon } from '../lib/icons';
import type { RoomView, ShowdownPlayer } from '@numberpoker/shared';
import { chips, cn, value as fmt } from '../lib/format';
import { Avatar, Panel } from './ui';
import { PlayingCard } from './cards';

function EquationLine({ pool, eq, winner }: { pool: 'small' | 'big'; eq: { expr: string; value: number; diff: number }; winner: boolean }) {
  const tone = pool === 'small' ? 'text-small ring-small/40 bg-small/10' : 'text-big ring-big/40 bg-big/10';
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className={cn('inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold ring-1', tone)}>
        {pool === 'small' ? 'Small' : 'Big'}
      </span>
      <span className="font-mono text-[15px] tabular text-muted">{eq.expr}</span>
      <span className="font-mono text-lg font-semibold tabular">= {fmt(eq.value)}</span>
      <span className="text-xs text-muted">
        {eq.diff === 0 ? 'exactly on target' : `${fmt(eq.diff)} away`}
      </span>
      {winner && (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent">
          <CrownSimpleIcon size={14} weight="fill" aria-hidden /> wins {pool}
        </span>
      )}
    </div>
  );
}

function Row({ p, view, index }: { p: ShowdownPlayer; view: RoomView; index: number }) {
  const r = view.result!;
  const net = p.payout - p.committed;
  const won = p.payout > 0;
  const mine = p.id === view.you;
  const live = view.players.find((x) => x.id === p.id);
  return (
    <motion.li
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 220, damping: 26, delay: 0.12 + index * 0.1 }}
      className={cn('rounded-2xl p-4 ring-1', won ? 'bg-surface-2 ring-accent/50' : 'bg-surface-2/60 ring-line')}
    >
      <div className="flex items-center gap-3">
        <Avatar name={p.name} bot={live?.isBot} ring={won} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold tracking-tight">
            {p.name}
            {mine && <span className="ml-1.5 text-sm font-normal text-muted">(you)</span>}
          </div>
          <div className="text-xs text-muted">
            {p.folded
              ? p.foldedBy === 'forfeit'
                ? 'Forfeited: no valid equation'
                : p.foldedBy === 'timeout'
                  ? 'Sat out'
                  : 'Folded'
              : p.betType
                ? `Bet ${p.betType}`
                : ''}
          </div>
        </div>
        <div className="text-right">
          <div className={cn('font-mono text-xl font-semibold tabular', net > 0 ? 'text-accent' : net < 0 ? 'text-danger' : 'text-muted')}>
            {net > 0 ? '+' : net < 0 ? '−' : ''}
            {chips(Math.abs(net))}
          </div>
          <div className="text-[11px] text-faint">{won ? `took ${chips(p.payout)}` : 'chips'}</div>
        </div>
      </div>

      {(p.small || p.big) && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          {p.small && <EquationLine pool="small" eq={p.small} winner={r.smallWinnerId === p.id} />}
          {p.big && <EquationLine pool="big" eq={p.big} winner={r.bigWinnerId === p.id} />}
        </div>
      )}

      {p.cards.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {p.cards.map((c) => (
            <PlayingCard key={c.id} card={c} size="xs" />
          ))}
        </div>
      )}
    </motion.li>
  );
}

export function Showdown({ view }: { view: RoomView }) {
  const r = view.result;
  if (!r) return null;
  const winners = r.winnerIds.map((id) => view.players.find((p) => p.id === id)?.name).filter(Boolean);
  const sorted = [...r.players].sort((a, b) => b.payout - b.committed - (a.payout - a.committed));

  return (
    <Panel innerClassName="p-5 md:p-7">
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
          <TrophyIcon size={24} weight="fill" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight">
            {r.pot === 0
              ? 'No chips were at stake'
              : winners.length > 0
                ? `${winners.join(' and ')} ${winners.length > 1 ? 'take' : 'takes'} the pot`
                : 'Bets returned'}
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {r.pot === 0 ? (
              'Raise next time to play for chips.'
            ) : (
              <>
                Pot of <span className="font-mono text-ink">{chips(r.pot)}</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-surface-2 p-4 ring-1 ring-line">
        <h3 className="text-sm font-semibold">Why it paid out this way</h3>
        <ul className="mt-2 space-y-1.5 text-[15px] leading-relaxed text-muted">
          {r.explanation.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>

      {r.kind === 'showdown' && (
        <ul className="mt-4 space-y-3">
          {sorted.map((p, i) => (
            <Row key={p.id} p={p} view={view} index={i} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
