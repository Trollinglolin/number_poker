import { useState } from 'react';
import {
  CardsIcon,
  CheckIcon,
  CopyIcon,
  ListBulletsIcon,
  MoonIcon,
  QuestionIcon,
  SignOutIcon,
  SunIcon,
} from '../lib/icons';
import type { Phase, RoomView } from '@numberpoker/shared';
import { cn } from '../lib/format';
import { useTheme } from '../lib/theme';
import { Sheet, useToast } from './ui';
import { RulesSheet } from './Rules';

const STEPS: { phases: Phase[]; label: string }[] = [
  { phases: ['preflop'], label: 'Bet' },
  { phases: ['dealing1'], label: 'Deal' },
  { phases: ['betting1'], label: 'Bet' },
  { phases: ['dealing2'], label: 'Deal' },
  { phases: ['betting2'], label: 'Bet' },
  { phases: ['equation'], label: 'Build' },
  { phases: ['ended'], label: 'Showdown' },
];

const stepIndex = (phase: Phase) => STEPS.findIndex((s) => s.phases.includes(phase));

export function RoundSteps({ phase }: { phase: Phase }) {
  const current = stepIndex(phase);
  if (current < 0) return null;
  return (
    <ol className="flex items-center gap-1.5" aria-label={`Round progress: step ${current + 1} of ${STEPS.length}, ${STEPS[current].label}`}>
      {STEPS.map((s, i) => (
        <li key={i} className="flex items-center gap-1.5">
          <span
            className={cn(
              'h-1.5 rounded-full transition-all duration-700 ease-out-expo',
              i === current ? 'w-7 bg-accent' : i < current ? 'w-3 bg-accent/55' : 'w-3 bg-ink/15',
            )}
          />
        </li>
      ))}
      <span className="ml-1.5 text-xs font-medium text-muted">{STEPS[current].label}</span>
    </ol>
  );
}

interface HeaderProps {
  view: RoomView;
  onLeave: () => void;
}

export function Header({ view, onLeave }: HeaderProps) {
  const { theme, toggle } = useTheme();
  const toast = useToast();
  const [rules, setRules] = useState(false);
  const [history, setHistory] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    const link = `${location.origin}/room/${view.code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast(`Table code ${view.code}`);
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
        <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-full bg-accent text-accent-ink">
            <CardsIcon size={17} weight="fill" aria-hidden />
          </span>
          <span className="hidden sm:inline">Number Poker</span>
        </span>

        <button
          onClick={copyLink}
          aria-label={`Table ${view.code}. Copy invite link`}
          className="group inline-flex h-9 items-center gap-2 rounded-full bg-surface-2 pl-3.5 pr-3 font-mono text-sm font-medium tracking-[0.18em] ring-1 ring-line-strong transition-colors hover:bg-surface-3"
        >
          {view.code}
          {copied ? <CheckIcon size={15} className="text-accent" aria-hidden /> : <CopyIcon size={15} className="text-muted group-hover:text-ink" aria-hidden />}
        </button>

        <div className="ml-auto hidden md:block">
          <RoundSteps phase={view.phase} />
        </div>

        <div className="ml-auto flex items-center gap-1 md:ml-2">
          <HeaderButton label="Event history" onClick={() => setHistory(true)}>
            <ListBulletsIcon size={19} />
          </HeaderButton>
          <HeaderButton label="How to play" onClick={() => setRules(true)}>
            <QuestionIcon size={19} />
          </HeaderButton>
          <HeaderButton label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggle}>
            {theme === 'dark' ? <SunIcon size={19} /> : <MoonIcon size={19} />}
          </HeaderButton>
          <HeaderButton label="Leave table" onClick={onLeave}>
            <SignOutIcon size={19} />
          </HeaderButton>
        </div>
      </div>
      <div className="border-t border-line px-4 py-2 md:hidden">
        <RoundSteps phase={view.phase} />
      </div>

      <RulesSheet open={rules} onClose={() => setRules(false)} />
      <Sheet open={history} onClose={() => setHistory(false)} labelledBy="history-title">
        <h2 id="history-title" className="mb-4 text-xl font-semibold tracking-tight">
          Recent events
        </h2>
        <ul className="space-y-2.5 text-[15px]">
          {[...view.log].reverse().map((e) => (
            <li key={e.seq} className="text-muted first:text-ink">
              {e.text}
            </li>
          ))}
          {view.log.length === 0 && <li className="text-muted">Nothing has happened yet.</li>}
        </ul>
      </Sheet>
    </header>
  );
}

function HeaderButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-10 place-items-center rounded-full text-muted transition-colors hover:bg-ink/[0.07] hover:text-ink"
    >
      {children}
    </button>
  );
}
