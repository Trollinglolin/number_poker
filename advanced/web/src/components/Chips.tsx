import type { CSSProperties } from 'react';
import { chipBreakdown } from '../lib/chipMath';
import type { Denom } from '../lib/chipMath';
import { chips as fmt, cn } from '../lib/format';

/** chip body colour and the colour of the printed value */
const LOOK: Record<Denom, { body: string; ink: string }> = {
  1: { body: '#e6ebe7', ink: '#26302b' },
  5: { body: '#c4504a', ink: '#fff5f3' },
  25: { body: '#2f9160', ink: '#f2fff8' },
  100: { body: '#262c2f', ink: '#eef2f3' },
  500: { body: '#3f79b9', ink: '#f1f7ff' },
  1000: { body: '#d6b049', ink: '#2e2406' },
};

const SIZE = { xs: 14, sm: 22, md: 30, lg: 38 } as const;
type ChipSize = keyof typeof SIZE;

/** one chip seen from above: coloured body, edge spots, inner ring and its value */
export function Chip({ denom, size = 'md', className }: { denom: Denom; size?: ChipSize; className?: string }) {
  const px = SIZE[size];
  const { body, ink } = LOOK[denom];
  const style = {
    width: px,
    height: px,
    fontSize: px * 0.3,
    '--chip': body,
    '--ink': ink,
  } as CSSProperties;
  return (
    <span aria-hidden className={cn('chip', className)} style={style}>
      <span className="chip-face">{denom >= 1000 ? '1K' : denom}</span>
    </span>
  );
}

/** a chip you can press: the quick-bet buttons are chips, like a poker client */
export function ChipButton({
  denom,
  label,
  selected,
  onClick,
  ariaLabel,
}: {
  denom: Denom;
  label: string;
  selected: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  const { body, ink } = LOOK[denom];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={cn('chip chip-btn', selected && 'chip-selected')}
      style={{ width: 54, height: 54, '--chip': body, '--ink': ink } as CSSProperties}
    >
      <span className="chip-face" style={{ fontSize: 11 }}>
        {label}
      </span>
    </button>
  );
}

/** a few short piles side by side. The exact amount is always printed next to it. */
export function ChipStack({
  amount,
  size = 'md',
  label = true,
  className,
}: {
  amount: number;
  size?: ChipSize;
  label?: boolean;
  className?: string;
}) {
  const piles = chipBreakdown(amount);
  if (amount <= 0) return null;
  const lift = size === 'xs' ? 2 : size === 'sm' ? 3 : size === 'md' ? 4 : 5;
  return (
    <span className={cn('inline-flex items-end gap-1.5', className)}>
      <span className="inline-flex items-end gap-0.5" aria-hidden>
        {piles.map((p) => (
          <span key={p.denom} className="relative block" style={{ width: SIZE[size], height: SIZE[size] + (p.count - 1) * lift }}>
            {Array.from({ length: p.count }).map((_, i) => (
              <span key={i} className="absolute left-0" style={{ bottom: i * lift }}>
                <Chip denom={p.denom} size={size} />
              </span>
            ))}
          </span>
        ))}
      </span>
      {label && <span className="font-mono text-xs font-semibold tabular text-felt-ink">{fmt(amount)}</span>}
    </span>
  );
}
