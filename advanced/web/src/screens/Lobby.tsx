import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRightIcon, CopyIcon, CrownSimpleIcon, RobotIcon, ShareNetworkIcon, UserPlusIcon, XIcon } from '../lib/icons';
import type { Command, RoomView } from '@numberpoker/shared';
import { game } from '../lib/client';
import { chips } from '../lib/format';
import { Header } from '../components/Header';
import { Avatar, Button, Panel, Sheet, useToast } from '../components/ui';

export function Lobby({ view }: { view: RoomView }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const isHost = view.hostId === view.you;
  const host = view.players.find((p) => p.id === view.hostId);
  const link = `${location.origin}/room/${view.code}`;
  const canStart = view.players.length >= 2;
  // two open seats are enough to say "there is room"; the heading carries the real count
  const open = Array.from({ length: Math.min(2, Math.max(0, view.limits.maxPlayers - view.players.length)) });

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
      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-6 px-4 py-8 lg:grid-cols-[1.15fr_0.85fr] lg:py-12">
        <Panel innerClassName="p-5 md:p-8">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Your table is open</h1>
          <p className="mt-2 max-w-[52ch] text-muted">Send the link or the code to your friends. They can join from any phone or laptop.</p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div
              aria-label={`Table code ${view.code}`}
              className="rounded-2xl bg-surface-2 px-5 py-3 text-center font-mono text-4xl font-semibold tracking-[0.3em] ring-1 ring-line-strong"
            >
              {view.code}
            </div>
            <div className="flex gap-2">
              <Button onClick={copy}>
                <CopyIcon size={17} aria-hidden /> Copy link
              </Button>
              <Button onClick={share}>
                <ShareNetworkIcon size={17} aria-hidden /> Share
              </Button>
            </div>
          </div>

          <h2 className="mb-3 mt-9 text-sm font-semibold text-muted">
            Seats ({view.players.length} of {view.limits.maxPlayers})
          </h2>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {view.players.map((p, i) => (
              <motion.li
                key={p.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24, delay: i * 0.04 }}
                className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 ring-1 ring-line"
              >
                <Avatar name={p.name} bot={p.isBot} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-semibold tracking-tight">{p.name}</span>
                    {p.id === view.you && <span className="text-xs text-muted">(you)</span>}
                    {p.isHost && <CrownSimpleIcon size={14} weight="fill" className="text-muted" aria-label="Host" />}
                  </div>
                  <div className="text-xs text-muted">
                    {p.isBot ? 'Bot' : p.connected ? 'Ready' : 'Reconnecting...'}
                  </div>
                </div>
                {isHost && p.id !== view.you && (
                  <button
                    aria-label={`Remove ${p.name}`}
                    onClick={() => run(`kick-${p.id}`, { type: 'kick', playerId: p.id })}
                    className="grid size-9 place-items-center rounded-full text-muted hover:bg-ink/10 hover:text-ink"
                  >
                    <XIcon size={16} />
                  </button>
                )}
              </motion.li>
            ))}
            {open.map((_, i) => (
              <li
                key={`open-${i}`}
                className="flex items-center gap-3 rounded-2xl border border-dashed border-line-strong p-3 text-sm text-faint"
              >
                <span className="grid size-10 place-items-center rounded-full border border-dashed border-line-strong">
                  <UserPlusIcon size={16} aria-hidden />
                </span>
                Open seat
              </li>
            ))}
          </ul>
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel innerClassName="p-5 md:p-7">
            <h2 className="text-xl font-semibold tracking-tight">{isHost ? 'Ready when you are' : `Waiting for ${host?.name ?? 'the host'}`}</h2>
            <ul className="mt-4 space-y-2.5 text-[15px] text-muted">
              <li>Everyone starts with {chips(view.limits.startingChips)} chips.</li>
              <li>Three betting rounds, then each player builds an equation.</li>
              <li>The match ends when one player holds every chip.</li>
            </ul>

            {isHost ? (
              <div className="mt-6 space-y-3">
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
              </div>
            ) : (
              <p className="mt-6 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted" role="status">
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
