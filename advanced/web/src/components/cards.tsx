import type { ButtonHTMLAttributes } from 'react';
import { EyeSlashIcon } from '../lib/icons';
import { OP_NAME, OP_SYMBOL } from '@numberpoker/shared';
import type { CardView } from '@numberpoker/shared';
import { cn } from '../lib/format';

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

const box: Record<CardSize, string> = {
  xs: 'h-11 w-8 text-base',
  sm: 'h-[62px] w-11 text-xl',
  md: 'h-[88px] w-[62px] text-3xl',
  lg: 'h-[100px] w-[70px] text-4xl sm:h-[112px] sm:w-[78px]',
};

interface CardProps {
  card: CardView;
  size?: CardSize;
  className?: string;
  /** dim a card that is already placed elsewhere */
  muted?: boolean;
}

function label(card: CardView): string {
  if (card.kind === 'hidden') return 'Hidden card';
  if (card.kind === 'number') return `${card.value} of ${card.color}`;
  return OP_NAME[card.op];
}

/** the face of any card. Wrap it in a <button> (see CardButton) to make it interactive. */
export function PlayingCard({ card, size = 'md', className, muted }: CardProps) {
  const base = cn('pcard font-mono font-semibold tabular', box[size], muted && 'opacity-40', className);

  if (card.kind === 'hidden') {
    return (
      <span role="img" aria-label="Hidden card" className={cn('pcard pcard-back', box[size], className)}>
        <EyeSlashIcon size={size === 'xs' ? 12 : 20} aria-hidden />
      </span>
    );
  }

  if (card.kind === 'number') {
    const showIndex = size === 'md' || size === 'lg';
    return (
      <span role="img" aria-label={label(card)} className={cn(base, `pcard-${card.color}`)}>
        {showIndex && (
          <>
            <span className="absolute left-1.5 top-1 text-[11px] font-semibold leading-none opacity-70">{card.value}</span>
            <span className="absolute bottom-1 right-1.5 rotate-180 text-[11px] font-semibold leading-none opacity-70">
              {card.value}
            </span>
            <span className="absolute bottom-1 left-1.5 text-[9px] font-medium uppercase leading-none opacity-55">{card.color[0]}</span>
          </>
        )}
        <span className="leading-none">{card.value}</span>
        {card.secret && (
          <span
            title="Only you can see this card"
            className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-surface text-muted ring-1 ring-line-strong"
          >
            <EyeSlashIcon size={11} aria-hidden />
          </span>
        )}
      </span>
    );
  }

  return (
    <span role="img" aria-label={label(card)} className={cn(base, 'pcard-op')}>
      <span className="leading-none">{OP_SYMBOL[card.op]}</span>
      {size === 'lg' && <span className="absolute bottom-1.5 text-[9px] font-medium uppercase tracking-wide opacity-60">{OP_NAME[card.op]}</span>}
    </span>
  );
}

interface CardButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  card: CardView;
  size?: CardSize;
  muted?: boolean;
}

/** a card you can press; keeps a visible focus ring and a lift on hover */
export function CardButton({ card, size = 'md', muted, className, ...rest }: CardButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      aria-label={rest['aria-label'] ?? label(card)}
      className={cn(
        'rounded-[11px] transition-transform duration-500 ease-out-expo hover:-translate-y-1 active:translate-y-0 active:scale-95',
        'disabled:pointer-events-none',
        className,
      )}
    >
      <PlayingCard card={card} size={size} muted={muted} />
    </button>
  );
}
