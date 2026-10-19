import { useState } from 'react';
import { ArrowRightIcon } from '../lib/icons';
import type { Command, OpCard, RoomView } from '@numberpoker/shared';
import { OP_NAME } from '@numberpoker/shared';
import { Sheet } from './ui';
import { PlayingCard } from './cards';

const multiply: OpCard = { id: 'swap-multiply', kind: 'op', op: 'multiply' };

/** forced choice when you draw a multiply card: trade + or -, or keep your cards */
export function SwapSheet({ view, send }: { view: RoomView; send: (c: Command) => Promise<boolean> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const me = view.players.find((p) => p.id === view.you);
  const open = view.pendingSwap?.playerId === view.you;
  const tradable = me?.ops.filter((o) => o.op === 'add' || o.op === 'subtract') ?? [];

  async function choose(key: string, cmd: Command) {
    setBusy(key);
    await send(cmd);
    setBusy(null);
  }

  return (
    <Sheet open={open} dismissible={false} labelledBy="swap-title">
      <div className="flex items-center gap-4">
        <PlayingCard card={multiply} size="lg" className="-rotate-3" />
        <div>
          <h2 id="swap-title" className="text-xl font-semibold tracking-tight">
            You drew a multiply card
          </h2>
          <p className="mt-1 text-sm text-muted">Trade an operator for it, or keep what you have. You cannot hold two.</p>
        </div>
      </div>

      <div className="mt-6 space-y-2.5">
        {tradable.map((o) => (
          <button
            key={o.id}
            disabled={busy !== null}
            onClick={() => choose(o.op, { type: 'swap', op: o.op as 'add' | 'subtract' })}
            className="group flex w-full items-center gap-4 rounded-2xl bg-surface-2 p-3.5 text-left ring-1 ring-line-strong transition-[background-color,transform] duration-500 ease-out-expo hover:bg-surface-3 active:scale-[0.99] disabled:opacity-50"
          >
            <PlayingCard card={o} size="sm" />
            <ArrowRightIcon size={18} className="text-faint transition-transform group-hover:translate-x-0.5" aria-hidden />
            <PlayingCard card={multiply} size="sm" />
            <span className="ml-1 flex-1 text-[15px]">
              <span className="font-medium">Trade {OP_NAME[o.op].toLowerCase()} for multiply</span>
            </span>
          </button>
        ))}
        <button
          disabled={busy !== null}
          onClick={() => choose('keep', { type: 'noSwap' })}
          className="flex w-full items-center justify-center rounded-2xl p-3.5 text-[15px] font-medium text-muted ring-1 ring-line transition-colors hover:bg-ink/[0.05] hover:text-ink disabled:opacity-50"
        >
          Keep my cards and discard the multiply
        </button>
      </div>
    </Sheet>
  );
}
