/**
 * Seats N bots around the table in a real browser and captures the table, to catch crowding
 * problems that a two-player game hides.
 *   URL=http://localhost:3920 OUT=./shots npx tsx scripts/table-shots.ts
 */
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:3920';
const OUT = process.env.OUT ?? './shots';
const COUNTS = (process.env.BOTS ?? '1,3,7').split(',').map(Number);
mkdirSync(OUT, { recursive: true });

const errors: string[] = [];

async function play(page: Page, bots: number, tag: string) {
  await page.goto(URL);
  await page.getByLabel('Your name').fill('Ada');
  await page.getByRole('button', { name: /Create a table/ }).click();
  await page.getByRole('heading', { name: 'Your table is open' }).waitFor();
  for (let i = 0; i < bots; i++) {
    await page.getByRole('button', { name: /Add a bot/ }).click();
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${tag}-lobby.png` });
  await page.getByRole('button', { name: /Start game/ }).click();

  const stepShots = new Set<number>();
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const swap = page.getByRole('button', { name: /Keep my cards/ });
    if (await swap.isVisible().catch(() => false)) {
      // the sheet animates in, so the first click can race it; just try again next loop
      await swap.click({ timeout: 2000 }).catch(() => {});
      continue;
    }
    const step = await page
      .locator('ol[aria-label^="Round progress"]')
      .first()
      .getAttribute('aria-label')
      .then((s) => Number(/step (\d)/.exec(s ?? '')?.[1] ?? 0))
      .catch(() => 0);

    const act = page.getByRole('button', { name: /^(Check|Call)/ });
    if (await act.isVisible().catch(() => false)) {
      if ((step === 1 || step === 3 || step === 5) && !stepShots.has(step)) {
        stepShots.add(step);
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${OUT}/${tag}-step${step}.png` });
        if (step === 5) return;
      }
      await act.click();
    }
    await page.waitForTimeout(200);
  }
  throw new Error(`${tag}: did not reach the last betting round`);
}

async function main() {
  const browser = await chromium.launch();
  const sizes = [
    { tag: 'm', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    { tag: 'd', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  ];
  for (const bots of COUNTS) {
    for (const s of sizes) {
      const ctx = await browser.newContext({
        ...s,
        colorScheme: process.env.THEME === 'light' ? 'light' : 'dark',
        reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference',
      });
      const page = await ctx.newPage();
      page.on('console', (m) => m.type() === 'error' && errors.push(`[${s.tag}/${bots}] console: ${m.text()}`));
      page.on('pageerror', (e) => errors.push(`[${s.tag}/${bots}] pageerror: ${e.message}`));
      console.log(`${bots + 1} players, ${s.tag}`);
      await play(page, bots, `${s.tag}-${bots + 1}p`);
      await ctx.close();
    }
  }
  await browser.close();
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log('table shots done in ' + OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
