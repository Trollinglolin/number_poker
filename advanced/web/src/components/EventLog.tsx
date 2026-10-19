import type { RoomView } from '@numberpoker/shared';
import { cn } from '../lib/format';

/** what just happened, newest first; fills whatever height its parent gives it and scrolls inside */
export function EventLog({ view, className }: { view: RoomView; className?: string }) {
  const entries = [...view.log].reverse().slice(0, 40);
  return (
    <section aria-label="Recent events" className={cn('flex min-h-0 flex-col rounded-3xl bg-surface p-4 ring-1 ring-line', className)}>
      <h2 className="text-sm font-semibold text-muted">Recent events</h2>
      <ul className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 text-[13px] leading-snug" aria-live="polite">
        {entries.map((e, i) => (
          <li key={e.seq} className={i === 0 ? 'text-ink' : 'text-muted'}>
            {e.text}
          </li>
        ))}
        {entries.length === 0 && <li className="text-muted">Nothing has happened yet.</li>}
      </ul>
    </section>
  );
}
