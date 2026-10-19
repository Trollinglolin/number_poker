import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { RobotIcon, SpinnerGapIcon, WarningCircleIcon, XIcon } from '../lib/icons';
import { cn, initials } from '../lib/format';

/* ------------------------------------------------------------------ Button */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** trailing icon, shown inside a small circle (the "island") */
  island?: ReactNode;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink shadow-[inset_0_1px_0_rgb(255_255_255/.3)] hover:brightness-105',
  secondary: 'bg-surface-2 text-ink ring-1 ring-line-strong hover:bg-surface-3',
  ghost: 'text-muted hover:text-ink hover:bg-ink/[0.06]',
  danger: 'bg-danger/12 text-danger ring-1 ring-danger/40 hover:bg-danger/20',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm gap-2',
  md: 'h-11 px-5 text-[15px] gap-2',
  lg: 'h-14 pl-7 pr-2.5 text-base gap-3',
};

export function Button({ variant = 'secondary', size = 'md', island, loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        'group inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-full font-medium',
        'transition-[transform,background-color,filter,box-shadow] duration-500 ease-out-expo',
        'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        sizes[size],
        Boolean(island) && size !== 'lg' && 'pr-2',
        className,
      )}
    >
      {loading && <SpinnerGapIcon className="animate-spin" size={18} aria-hidden />}
      {children}
      {island && (
        <span
          className={cn(
            'grid place-items-center rounded-full bg-black/10 transition-transform duration-500 ease-out-expo group-hover:-translate-y-px group-hover:translate-x-0.5',
            size === 'lg' ? 'size-10' : 'size-7',
          )}
        >
          {island}
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------- Panel */

/** two nested shells, like a glass plate set in a tray */
export function Panel({ children, className, innerClassName }: { children: ReactNode; className?: string; innerClassName?: string }) {
  return (
    <div className={cn('rounded-[28px] bg-ink/[0.035] p-1.5 ring-1 ring-line', className)}>
      <div
        className={cn(
          'rounded-[22px] bg-surface shadow-[inset_0_1px_0_rgb(255_255_255/.05),var(--shadow)]',
          innerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- Sheet */

interface SheetProps {
  open: boolean;
  onClose?: () => void;
  /** false forces a choice: no Escape, no backdrop dismiss */
  dismissible?: boolean;
  labelledBy: string;
  children: ReactNode;
  wide?: boolean;
}

/** native <dialog>: focus trap, Escape and inert background for free. A bottom sheet on phones. */
export function Sheet({ open, onClose, dismissible = true, labelledBy, children, wide }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose?.();
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) onClose?.();
      }}
    >
      {open && (
        <div className="pointer-events-none flex min-h-full items-end justify-center md:items-center md:p-6">
          <div
            className={cn(
              'sheet-panel pointer-events-auto max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-[28px] bg-surface p-5 ring-1 ring-line-strong shadow-[var(--shadow)] md:rounded-[28px] md:p-7',
              wide ? 'md:max-w-3xl' : 'md:max-w-lg',
            )}
          >
            {children}
          </div>
        </div>
      )}
    </dialog>
  );
}

/* ------------------------------------------------------------------ Toasts */

type ToastKind = 'info' | 'error';
interface ToastItem {
  id: number;
  text: string;
  kind: ToastKind;
}

const ToastContext = createContext<(text: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = nextId.current++;
    setItems((cur) => [...cur.slice(-2), { id, text, kind }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), 4500);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] z-40 flex flex-col items-center gap-2 px-4 md:bottom-8"
      >
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              className={cn(
                'pointer-events-auto flex max-w-md items-center gap-2.5 rounded-full py-2.5 pl-4 pr-3 text-sm shadow-[var(--shadow)] ring-1',
                t.kind === 'error' ? 'bg-surface-2 text-ink ring-danger/50' : 'bg-surface-2 text-ink ring-line-strong',
              )}
            >
              {t.kind === 'error' && <WarningCircleIcon size={18} className="shrink-0 text-danger" aria-hidden />}
              <span>{t.text}</span>
              <button
                aria-label="Dismiss"
                onClick={() => setItems((cur) => cur.filter((x) => x.id !== t.id))}
                className="grid size-6 place-items-center rounded-full text-muted hover:bg-ink/10 hover:text-ink"
              >
                <XIcon size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------------------ Avatar */

export function Avatar({ name, bot, size = 40, ring, onFelt }: { name: string; bot?: boolean; size?: number; ring?: boolean; onFelt?: boolean }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className={cn(
        'relative grid shrink-0 place-items-center rounded-full font-semibold tracking-tight ring-1',
        // on the felt the avatar keeps the dark-table colours in either theme
        onFelt ? 'bg-[#1d2b25] text-felt-ink' : 'bg-surface-3 text-ink',
        ring ? (onFelt ? 'ring-felt-accent' : 'ring-accent') : onFelt ? 'ring-white/20' : 'ring-line-strong',
      )}
    >
      {bot ? <RobotIcon size={size * 0.5} /> : initials(name)}
    </span>
  );
}
