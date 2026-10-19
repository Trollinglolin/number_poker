import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRightIcon, CardsIcon, CoinsIcon, MoonIcon, QuestionIcon, RobotIcon, SunIcon, WarningCircleIcon } from '../lib/icons';
import { CODE_ALPHABET, CODE_LENGTH, MAX_PLAYERS, NAME_MAX } from '@numberpoker/shared';
import type { CardView } from '@numberpoker/shared';
import { game, savedName, useGame } from '../lib/client';
import { useTheme } from '../lib/theme';
import { cn } from '../lib/format';
import { Button, Panel, useToast } from '../components/ui';
import { PlayingCard } from '../components/cards';
import { RulesSheet } from '../components/Rules';

const n = (value: number, color: 'gold' | 'silver' | 'bronze' | 'dark'): CardView => ({ id: `h${value}${color}`, kind: 'number', value, color });
const op = (o: 'add' | 'subtract' | 'multiply' | 'divide' | 'sqrt'): CardView => ({ id: `h${o}`, kind: 'op', op: o });

/** 9 x 2 + sqrt 4 = 20: a real, valid hand built from the real card components */
const HERO: CardView[] = [n(9, 'silver'), op('multiply'), n(2, 'gold'), op('add'), op('sqrt'), n(4, 'dark')];

function Field({ label, error, children, id }: { label: string; error?: string; children: React.ReactNode; id: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-muted">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="flex items-center gap-1.5 text-sm text-danger">
          <WarningCircleIcon size={15} aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}

const inputClass =
  'h-12 w-full rounded-2xl bg-surface-2 px-4 text-base text-ink placeholder:text-faint ring-1 ring-line-strong outline-none transition-shadow focus:ring-2 focus:ring-accent aria-[invalid=true]:ring-danger';

export function Home({ initialCode }: { initialCode?: string }) {
  const { notice, status, ready } = useGame();
  const toast = useToast();
  const { theme, toggle } = useTheme();
  const [name, setName] = useState(savedName());
  const [code, setCode] = useState(initialCode ?? '');
  const [errors, setErrors] = useState<{ name?: string; code?: string }>({});
  const [busy, setBusy] = useState<'create' | 'join' | 'bot' | null>(null);
  const [rules, setRules] = useState(false);

  const offline = status === 'offline' || (!ready && status !== 'online');

  function checkName(): string | null {
    const clean = name.trim();
    if (!clean) {
      setErrors((e) => ({ ...e, name: 'Enter a name so your friends know who you are.' }));
      return null;
    }
    return clean;
  }

  async function create(practice: boolean) {
    const clean = checkName();
    if (!clean) return;
    setBusy(practice ? 'bot' : 'create');
    const res = await game.create(clean);
    if (!res.ok) {
      toast(res.error, 'error');
    } else if (practice) {
      await game.command({ type: 'addBot' });
      const started = await game.command({ type: 'start' });
      if (!started.ok) toast(started.error, 'error');
    }
    setBusy(null);
  }

  async function join() {
    const clean = checkName();
    const next: typeof errors = {};
    if (!clean) next.name = 'Enter a name so your friends know who you are.';
    if (code.length !== CODE_LENGTH) next.code = `Table codes have ${CODE_LENGTH} characters.`;
    setErrors(next);
    if (next.name || next.code) return;
    setBusy('join');
    const res = await game.join(code, clean!);
    setBusy(null);
    if (!res.ok) setErrors({ code: res.error });
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5">
      <nav className="flex h-16 items-center justify-between">
        <span className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
          <span className="grid size-9 place-items-center rounded-full bg-accent text-accent-ink">
            <CardsIcon size={19} weight="fill" aria-hidden />
          </span>
          Number Poker
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setRules(true)}>
            <QuestionIcon size={17} aria-hidden /> How to play
          </Button>
          <button
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={toggle}
            className="grid size-10 place-items-center rounded-full text-muted transition-colors hover:bg-ink/[0.07] hover:text-ink"
          >
            {theme === 'dark' ? <SunIcon size={19} /> : <MoonIcon size={19} />}
          </button>
        </div>
      </nav>

      <main className="flex-1">
        <section className="grid items-center gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)] lg:gap-14 lg:py-14">
          <div>
            <h1 className="text-[2.6rem] font-semibold leading-[1.02] tracking-tighter sm:text-6xl">
              Poker with
              <br />
              arithmetic.
            </h1>
            <p className="mt-5 max-w-[44ch] text-lg leading-relaxed text-muted">
              Bet like poker, then build the equation that lands closest to 1 or 20.
            </p>

            {notice && (
              <div role="status" className="mt-6 flex items-start gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm ring-1 ring-line-strong">
                <WarningCircleIcon size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                <span className="flex-1">{notice}</span>
                <button onClick={() => game.dismissNotice()} className="text-muted hover:text-ink">
                  Dismiss
                </button>
              </div>
            )}

            <Panel className="mt-8 max-w-md" innerClassName="space-y-5 p-5 md:p-6">
              <Field id="name" label="Your name" error={errors.name}>
                <input
                  id="name"
                  value={name}
                  maxLength={NAME_MAX}
                  autoComplete="nickname"
                  aria-invalid={Boolean(errors.name)}
                  aria-describedby={errors.name ? 'name-error' : undefined}
                  onChange={(e) => {
                    setName(e.target.value);
                    setErrors((x) => ({ ...x, name: undefined }));
                  }}
                  placeholder="Ada"
                  className={inputClass}
                />
              </Field>

              <Button
                variant="primary"
                size="lg"
                className="w-full justify-between"
                loading={busy === 'create'}
                disabled={offline}
                onClick={() => create(false)}
                island={<ArrowRightIcon size={18} weight="bold" />}
              >
                Create a table
              </Button>

              <div className="flex items-center gap-3 text-xs text-faint" aria-hidden>
                <span className="h-px flex-1 bg-line-strong" />
                or join friends
                <span className="h-px flex-1 bg-line-strong" />
              </div>

              <Field id="code" label="Table code" error={errors.code}>
                <div className="flex gap-2">
                  <input
                    id="code"
                    value={code}
                    inputMode="text"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={CODE_LENGTH}
                    aria-invalid={Boolean(errors.code)}
                    aria-describedby={errors.code ? 'code-error' : undefined}
                    onChange={(e) => {
                      const allowed = e.target.value.toUpperCase().split('').filter((ch) => CODE_ALPHABET.includes(ch)).join('');
                      setCode(allowed);
                      setErrors((x) => ({ ...x, code: undefined }));
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && join()}
                    placeholder="K7M2Q"
                    className={cn(inputClass, 'font-mono tracking-[0.3em] uppercase')}
                  />
                  <Button size="md" className="h-12" loading={busy === 'join'} disabled={offline} onClick={join}>
                    Join
                  </Button>
                </div>
              </Field>

              <Button variant="ghost" className="w-full" loading={busy === 'bot'} disabled={offline} onClick={() => create(true)}>
                <RobotIcon size={18} aria-hidden /> Practice against a bot
              </Button>
              {offline && (
                <p role="status" className="text-center text-sm text-muted">
                  {status === 'offline' ? 'Cannot reach the server. Retrying...' : 'Connecting...'}
                </p>
              )}
            </Panel>
          </div>

          <HeroVisual />
        </section>

        <HowItPlays />
      </main>

      <footer className="py-10 text-center text-sm text-faint">Tables seat up to {MAX_PLAYERS} players.</footer>
      <RulesSheet open={rules} onClose={() => setRules(false)} />
    </div>
  );
}

function HeroVisual() {
  return (
    <Panel innerClassName="overflow-hidden">
      <div className="relative px-6 py-10 sm:px-10 sm:py-14" style={{ background: 'var(--felt)' }}>
        <div className="mb-8 flex items-end justify-between">
          <div>
            <div className="text-sm font-medium text-muted">Your equation</div>
            <div className="mt-1 text-xs text-faint">Every card used once</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium text-muted">Target</div>
            <div className="font-mono text-3xl font-semibold tabular text-big">20</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
          {HERO.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: -30, rotate: i % 2 ? 5 : -5 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 20, delay: 0.15 + i * 0.09 }}
            >
              <PlayingCard card={c} size="md" />
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
          className="mt-9 flex items-baseline justify-center gap-3"
        >
          <span className="font-mono text-5xl font-semibold tabular tracking-tight text-big sm:text-6xl">20</span>
          <span className="text-sm text-muted">exactly on target</span>
        </motion.div>
      </div>
    </Panel>
  );
}

function HowItPlays() {
  const tile = 'rounded-[24px] p-6 ring-1 ring-line';
  return (
    <section className="py-12 md:py-20">
      <h2 className="max-w-[18ch] text-3xl font-semibold leading-tight tracking-tight md:text-4xl">How a hand plays</h2>

      <div className="mt-8 grid gap-4 md:grid-cols-6">
        <div className={cn(tile, 'bg-surface md:col-span-3')}>
          <CoinsIcon size={28} weight="duotone" className="text-accent" aria-hidden />
          <h3 className="mt-5 text-lg font-semibold tracking-tight">Three betting rounds</h3>
          <p className="mt-2 max-w-[44ch] text-[15px] leading-relaxed text-muted">
            Bet before any cards, after two, and after four. Fold, check, call or raise, just like Hold&apos;em.
          </p>
        </div>

        <div className={cn(tile, 'bg-surface md:col-span-3')}>
          <div className="flex gap-2">
            <PlayingCard card={op('multiply')} size="sm" className="-rotate-6" />
            <PlayingCard card={op('sqrt')} size="sm" className="rotate-3" />
          </div>
          <h3 className="mt-5 text-lg font-semibold tracking-tight">Two special cards</h3>
          <p className="mt-2 max-w-[44ch] text-[15px] leading-relaxed text-muted">
            Draw a multiply and you may trade your add or subtract for it. A square root is a free extra draw.
          </p>
        </div>

        <div
          className={cn(tile, 'md:col-span-2')}
          style={{ background: 'linear-gradient(150deg, color-mix(in oklab, var(--small) 18%, var(--surface)), color-mix(in oklab, var(--big) 18%, var(--surface)))' }}
        >
          <div className="flex items-baseline gap-4 font-mono text-5xl font-semibold tabular tracking-tight">
            <span className="text-small">1</span>
            <span className="text-big">20</span>
          </div>
          <h3 className="mt-5 text-lg font-semibold tracking-tight">Small, big or both</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">Get closest to 1 or to 20. Bet both and you must win both.</p>
        </div>

        <div className={cn(tile, 'md:col-span-4')} style={{ background: 'var(--felt)' }}>
          <div className="flex flex-wrap items-center gap-1.5">
            {[n(7, 'bronze'), op('subtract'), n(3, 'gold'), op('divide'), n(1, 'dark'), op('add'), n(8, 'silver')].map((c) => (
              <PlayingCard key={c.id} card={c} size="sm" />
            ))}
          </div>
          <h3 className="mt-5 text-lg font-semibold tracking-tight">Build the equation</h3>
          <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-muted">
            Use every card once. Multiply and divide come before add and subtract, so order matters. Tap to place, drag to rearrange.
          </p>
        </div>
      </div>
    </section>
  );
}
