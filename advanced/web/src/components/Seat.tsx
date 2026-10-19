import { motion } from 'motion/react';
import { CheckCircleIcon, CrownSimpleIcon, WifiSlashIcon } from '../lib/icons';
import type { CardView, PlayerView, RoomView } from '@numberpoker/shared';
import { chips, cn } from '../lib/format';
import { Avatar } from './ui';
import { PlayingCard } from './cards';

/** numbers first (dealt order), then extra square root / multiply cards, then the starting operators */
export function orderedCards(p: PlayerView): CardView[] {
  const numbers = p.cards.filter((c) => c.kind === 'number' || c.kind === 'hidden');
  const extras = p.cards.filter((c) => c.kind === 'op');
  return [...numbers, ...extras, ...p.ops];
}

function Status({ p, view, turn }: { p: PlayerView; view: RoomView; turn: boolean }) {
  let text: string | null = null;
  let tone = 'text-muted';
  if (p.eliminated) text = 'Out of chips';
  else if (p.folded) text = p.foldedBy === 'forfeit' ? 'Forfeited' : p.foldedBy === 'timeout' ? 'Sitting out' : 'Folded';
  else if (!p.connected && !p.isBot) {
    text = 'Away';
    tone = 'text-danger';
  } else if (view.phase === 'equation') {
    return p.submitted ? (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
        <CheckCircleIcon size={14} weight="fill" aria-hidden /> Locked in
      </span>
    ) : (
      <span className="text-xs text-muted">Building...</span>
    );
  } else if (view.pendingSwap?.playerId === p.id) {
    text = 'Choosing a swap';
    tone = 'text-accent';
  } else if (turn) {
    text = p.isBot ? 'Thinking...' : 'To act';
    tone = 'text-accent';
  } else if (p.allIn) text = 'All in';
  if (!text) return <span className="text-xs text-transparent select-none">.</span>;
  return <span className={cn('inline-flex items-center gap-1 text-xs font-medium', tone)}>
    {!p.connected && !p.isBot && <WifiSlashIcon size={13} aria-hidden />}
    {text}
  </span>;
}

export function Seat({ p, view, className }: { p: PlayerView; view: RoomView; className?: string }) {
  const turn = view.turn === p.id;
  const out = p.folded || p.eliminated;
  const cards = orderedCards(p);

  return (
    <div
      className={cn(
        'relative min-w-[220px] snap-start rounded-[20px] bg-surface p-3.5 ring-1 transition-colors duration-500 ease-out-expo md:min-w-0',
        turn ? 'ring-accent/70' : 'ring-line',
        className,
      )}
    >
      {turn && <span aria-hidden className="turn-ring pointer-events-none absolute -inset-[3px] rounded-[23px] ring-2 ring-accent/60" />}
      <div className={cn('flex items-center gap-3', out && 'opacity-55')}>
        <Avatar name={p.name} bot={p.isBot} ring={turn} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold tracking-tight">{p.name}</span>
            {p.isHost && <CrownSimpleIcon size={14} weight="fill" className="shrink-0 text-muted" aria-label="Host" />}
          </div>
          <Status p={p} view={view} turn={turn} />
        </div>
        <div className="text-right">
          <div className="font-mono text-[15px] font-semibold tabular">{chips(p.chips)}</div>
          <div className="text-[11px] text-faint">chips</div>
        </div>
      </div>

      <div className={cn('mt-3 flex min-h-[44px] flex-wrap items-center gap-1', out && 'opacity-45')}>
        {cards.length === 0 ? (
          <span className="text-xs text-faint">No cards yet</span>
        ) : (
          cards.map((c, i) => (
            <motion.span
              key={c.id}
              initial={{ opacity: 0, y: -14, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24, delay: Math.min(i, 6) * 0.04 }}
              className="inline-flex"
            >
              <PlayingCard card={c} size="xs" />
            </motion.span>
          ))
        )}
      </div>

      {p.bet > 0 && !p.folded && (
        <div className="absolute -bottom-2.5 right-4 rounded-full bg-surface-3 px-2.5 py-0.5 font-mono text-xs font-medium tabular ring-1 ring-line-strong">
          bet {chips(p.bet)}
        </div>
      )}
    </div>
  );
}
