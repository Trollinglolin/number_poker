import { useState } from 'react';
import { ArrowRightIcon, CopyIcon, RobotIcon, ShareNetworkIcon } from '../lib/icons';
import type { Command, RoomView } from '@numberpoker/shared';
import { game } from '../lib/client';
import { chips } from '../lib/format';
import { Header } from '../components/Header';
import { PokerTable } from '../components/PokerTable';
import { Button, Panel, Sheet, useToast } from '../components/ui';

/** the table code, printed on the felt like the table's name */
function CodeOnFelt({ view }: { view: RoomView }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center text-felt-ink">
      <span className="text-[11px] text-felt-muted md:text-sm">Table code</span>
      <span aria-label={`Table code ${view.code}`} className="mt-1 font-mono text-3xl font-semibold tracking-[0.22em] md:text-6xl">
        {view.code}
      </span>
      <span className="mt-2 text-[11px] text-felt-muted md:text-sm">
        {view.players.length} of {view.limits.maxPlayers} seated
      </span>
    </div>
  );
}

export function Lobby({ view }: { view: RoomView }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const isHost = view.hostId === view.you;
  const host = view.players.find((p) => p.id === view.hostId);
  const link = `${location.origin}/room/${view.code}`;
  const canStart = view.players.length >= 2;
  // two open seats are enough to say "there is room"; the count under the code is exact
  const open = Math.min(2, Math.max(0, view.limits.maxPlayers - view.players.length));

  async function run(key: string, cmd: Command) {
    setBusy(key);
    const res = await game.command(cmd);
    setBusy(null);
    if (!res.ok) toast(res.error, 'error');
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast('Invite link copied.');
    } catch {
      toast(`Share this link: ${link}`);
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Number Poker', text: `Join my table ${view.code}`, url: link });
        return;
      } catch {
        /* cancelled: fall through to copy */
      }
    }
    copy();
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Header view={view} onLeave={() => setLeaving(true)} />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-2 pb-12 pt-6 md:px-4">
        <div className="px-3 text-center md:px-0">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Your table is open</h1>
          <p className="mx-auto mt-2 max-w-[52ch] text-muted">Send the link or the code to your friends. They can join from any phone or laptop.</p>
        </div>

        <PokerTable
          view={view}
          centre={<CodeOnFelt view={view} />}
          emptySeats={open}
          onKick={isHost ? (id) => void run(`kick-${id}`, { type: 'kick', playerId: id }) : undefined}
        />

        <div className="mx-auto mt-8 grid max-w-3xl gap-5 px-1 md:grid-cols-[1fr_1fr] md:px-0">
          <Panel className="h-full" innerClassName="h-full p-5 md:p-6">
            <h2 className="text-lg font-semibold tracking-tight">Invite friends</h2>
            <p className="mt-1 text-sm text-muted">Anyone with the link or the code can sit down.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={copy}>
                <CopyIcon size={17} aria-hidden /> Copy link
              </Button>
              <Button onClick={share}>
                <ShareNetworkIcon size={17} aria-hidden /> Share
              </Button>
            </div>
            <p className="mt-4 text-xs text-faint">
              Everyone starts with {chips(view.limits.startingChips)} chips. The match ends when one player holds every chip.
            </p>
          </Panel>

          <Panel className="h-full" innerClassName="h-full p-5 md:p-6">
            <h2 className="text-lg font-semibold tracking-tight">{isHost ? 'Ready when you are' : `Waiting for ${host?.name ?? 'the host'}`}</h2>
            {isHost ? (
              <div className="mt-4 space-y-3">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full justify-between"
                  disabled={!canStart}
                  loading={busy === 'start'}
                  onClick={() => run('start', { type: 'start' })}
                  island={<ArrowRightIcon size={18} weight="bold" />}
                >
                  Start game
                </Button>
                {!canStart && <p className="text-center text-sm text-muted">You need at least one more player, or add a bot.</p>}
                <Button
                  className="w-full"
                  disabled={view.players.length >= view.limits.maxPlayers}
                  loading={busy === 'bot'}
                  onClick={() => run('bot', { type: 'addBot' })}
                >
                  <RobotIcon size={18} aria-hidden /> Add a bot
                </Button>
                <p className="text-xs text-faint">Tap a player at the table to remove them.</p>
              </div>
            ) : (
              <p className="mt-4 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted" role="status">
                The host will start the game once everyone is here.
              </p>
            )}
          </Panel>
        </div>
      </main>

      <Sheet open={leaving} onClose={() => setLeaving(false)} labelledBy="lobby-leave-title">
        <h2 id="lobby-leave-title" className="text-xl font-semibold tracking-tight">
          Leave this table?
        </h2>
        <p className="mt-2 text-sm text-muted">Your seat is given up. You can rejoin with the table code.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setLeaving(false)}>
            Stay
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              setLeaving(false);
              await game.leave();
            }}
          >
            Leave table
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
