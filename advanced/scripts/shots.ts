/**
 * Drives the real UI in a browser and saves screenshots (phone + desktop, dark + light).
 *   URL=http://localhost:3920 OUT=./shots npx tsx scripts/shots.ts
 * Also a smoke test: it plays a full practice hand (bets, swap, equation, showdown) by
 * clicking, and fails on console errors or unexpected page errors.
 */
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import { bestArrangement } from '@numberpoker/shared';
import type { Card } from '@numberpoker/shared';

const URL = process.env.URL ?? 'http://localhost:3920';
const OUT = process.env.OUT ?? './shots';
mkdirSync(OUT, { recursive: true });

const errors: string[] = [];

const OPS: Record<string, Card['kind'] extends never ? never : any> = {
  Add: 'add',
  Subtract: 'subtract',
  Multiply: 'multiply',
  Divide: 'divide',
  'Square root': 'sqrt',
};

function parse(label: string, i: number): Card {
  const m = /^(\d+) of (gold|silver|bronze|dark)$/.exec(label);
  if (m) return { id: `c${i}`, kind: 'number', value: Number(m[1]), color: m[2] as any };
  return { id: `c${i}`, kind: 'op', op: OPS[label] };
}

async function buildPool(page: Page, pool: 'small' | 'big', target: number) {
  const section = page.locator(`section[aria-label="${pool} equation"]`);
  // the cards still in hand are the buttons whose label has no "placed" suffix
  const labels = await section.locator('button[aria-label]:not([aria-label*="placed"])').evaluateAll((els) =>
    els.map((e) => e.getAttribute('aria-label')!),
  );
  const hand = labels.map(parse);
  const best = bestArrangement(hand, target);
  if (!best) throw new Error(`no arrangement for ${labels.join(', ')}`);
  for (const card of best.ordered) {
    const label = labels[Number(card.id.slice(1))];
    await section.locator(`button[aria-label="${label}"]`).first().click();
  }
  return best.value;
}

async function play(page: Page, tag: string) {
  // full page for the long marketing screen, the viewport for the game (sticky bars smear in full-page shots)
  const shot = (name: string, fullPage = false) => page.screenshot({ path: `${OUT}/${tag}-${name}.png`, fullPage });

  await page.goto(URL);
  await page.getByLabel('Your name').fill('Ada');
  await page.waitForTimeout(400);
  await shot('01-home', true);

  // the lobby flow: create a table, look at it and the rules, add a bot, start
  await page.getByRole('button', { name: /Create a table/ }).click();
  await page.getByRole('heading', { name: 'Your table is open' }).waitFor();
  await page.waitForTimeout(600);
  await shot('01b-lobby', true);
  await page.getByRole('button', { name: 'How to play' }).click();
  await page.waitForTimeout(700);
  await shot('01c-rules');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Add a bot/ }).click();
  await page.getByRole('button', { name: /Start game/ }).click();
  let shotBet = false;
  let shotSwap = false;
  let shotEq = false;
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    // forced multiply decision
    const swap = page.getByRole('heading', { name: 'You drew a multiply card' });
    if (await swap.isVisible().catch(() => false)) {
      if (!shotSwap) {
        await page.waitForTimeout(600);
        await shot('04-swap');
        shotSwap = true;
      }
      await page.getByRole('button', { name: /Trade add for multiply/ }).click();
      await page.waitForTimeout(300);
      continue;
    }

    // equation phase
    if (await page.getByRole('heading', { name: 'Build your equation' }).isVisible().catch(() => false)) {
      await page.getByRole('radio', { name: /Both/ }).click();
      await page.waitForTimeout(300);
      const s = await buildPool(page, 'small', 1);
      const b = await buildPool(page, 'big', 20);
      await page.waitForTimeout(500);
      if (!shotEq) {
        await shot('05-equation', true);
        shotEq = true;
      }
      console.log(`  built small=${s} big=${b}`);
      await page.getByRole('button', { name: /Lock in both equations/ }).click();
      await page.getByText(/Why it paid out this way/).waitFor({ timeout: 30_000 });
      await page.waitForTimeout(1600);
      await shot('06-showdown', true);
      await page.getByRole('button', { name: 'Deal next hand' }).waitFor();
      console.log(`  ${tag}: full hand played in the UI`);
      return;
    }

    const act = page.getByRole('button', { name: /^(Check|Call)/ });
    if (await act.isVisible().catch(() => false)) {
      if (!shotBet) {
        await page.waitForTimeout(700);
        await shot('02-betting');
        // open the raise controls for a second look
        await page.getByRole('button', { name: 'Raise', exact: true }).click();
        await page.waitForTimeout(500);
        await shot('03-raise');
        await page.getByRole('button', { name: 'Raise', exact: true }).click();
        shotBet = true;
      }
      await act.click();
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`${tag}: did not reach a showdown in time`);
}

async function main() {
  const browser = await chromium.launch();
  const sizes = [
    { tag: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    { tag: 'desktop', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  ];
  for (const theme of ['dark', 'light'] as const) {
    for (const s of sizes) {
      if (theme === 'light' && s.tag === 'mobile') continue; // light mode: desktop pass is enough for the matrix
      const ctx = await browser.newContext({
        viewport: s.viewport,
        deviceScaleFactor: s.deviceScaleFactor,
        isMobile: s.isMobile,
        hasTouch: s.hasTouch,
        colorScheme: theme,
      });
      const page = await ctx.newPage();
      page.on('console', (m) => m.type() === 'error' && errors.push(`[${s.tag}/${theme}] console: ${m.text()}`));
      page.on('pageerror', (e) => errors.push(`[${s.tag}/${theme}] pageerror: ${e.message}`));
      console.log(`${s.tag}/${theme}`);
      await play(page, `${s.tag}-${theme}`);
      await ctx.close();
    }
  }
  await browser.close();
  if (errors.length) {
    console.error('\nBrowser errors:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log('\nui smoke test passed, screenshots in ' + OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
