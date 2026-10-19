/**
 * "Does it fit a normal computer screen?" Opens the game at realistic browser viewport sizes (the window minus
 * the browser's own toolbars) and asserts the PAGE never scrolls, in every phase. Scrolling inside the side
 * panel or the equation builder is allowed; page scrolling is not.
 *   URL=http://localhost:3920 OUT=./shots BOTS=1,7 npx tsx scripts/fit-check.ts
 */
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import { bestArrangement } from '@numberpoker/shared';
import type { Card } from '@numberpoker/shared';

const URL = process.env.URL ?? 'http://localhost:3920';
const OUT = process.env.OUT ?? './shots';
const ONLY = process.env.ONLY?.split(',');
const BOTS = (process.env.BOTS ?? '1,7').split(',').map(Number);
const SIZES = [
  { tag: '1280x600', width: 1280, height: 600 },
  { tag: '1366x650', width: 1366, height: 650 },
  { tag: '1440x790', width: 1440, height: 790 },
  { tag: '1920x970', width: 1920, height: 970 },
];
mkdirSync(OUT, { recursive: true });

const failures: string[] = [];
const errors: string[] = [];

const OPS: Record<string, any> = { Add: 'add', Subtract: 'subtract', Multiply: 'multiply', Divide: 'divide', 'Square root': 'sqrt' };
function parse(label: string, i: number): Card {
  const m = /^(\d+) of (gold|silver|bronze|dark)$/.exec(label);
  if (m) return { id: `c${i}`, kind: 'number', value: Number(m[1]), color: m[2] as any };
  return { id: `c${i}`, kind: 'op', op: OPS[label] };
}

async function buildPool(page: Page, pool: 'small' | 'big', target: number) {
  const section = page.locator(`section[aria-label="${pool} equation"]`);
  const labels = await section
    .locator('button[aria-label]:not([aria-label*="placed"])')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!));
  const best = bestArrangement(labels.map(parse), target);
  if (!best) throw new Error('no arrangement');
  for (const card of best.ordered) {
    await section.locator(`button[aria-label="${labels[Number(card.id.slice(1))]}"]`).first().click();
  }
}

async function run(page: Page, tag: string, bots: number) {
  const shot = (name: string) => page.screenshot({ path: `${OUT}/${tag}-${bots + 1}p-${name}.png` });
  const fits = new Set<string>();
  const assertFit = async (stage: string) => {
    if (fits.has(stage)) return;
    fits.add(stage);
    const { sh, ih, sw, iw } = await page.evaluate(() => ({
      sh: document.documentElement.scrollHeight,
      ih: window.innerHeight,
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
    }));
    const ok = sh <= ih + 1 && sw <= iw + 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${tag} ${bots + 1}p ${stage}: page ${sw}x${sh} in ${iw}x${ih}`);
    if (!ok) failures.push(`${tag} ${bots + 1}p ${stage}: page ${sw}x${sh} does not fit ${iw}x${ih}`);
    await shot(stage);
  };

  // the page may not scroll AND the controls that matter must sit fully inside the window (nothing clipped)
  const assertVisible = async (what: string, locator: ReturnType<Page['locator']>) => {
    if (fits.has(`v:${what}`)) return;
    fits.add(`v:${what}`);
    const box = await locator.first().boundingBox().catch(() => null);
    const ih = page.viewportSize()!.height;
    const iw = page.viewportSize()!.width;
    const ok = !!box && box.y >= -1 && box.y + box.height <= ih + 1 && box.x >= -1 && box.x + box.width <= iw + 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${tag} ${bots + 1}p ${what} is inside the window${box ? ` (bottom ${Math.round(box.y + box.height)} of ${ih})` : ' (not found)'}`);
    if (!ok) failures.push(`${tag} ${bots + 1}p ${what} is clipped or missing`);
  };

  await page.goto(URL);
  await page.getByLabel('Your name').fill('Ada');
  await page.getByRole('button', { name: /Create a table/ }).click();
  await page.getByRole('heading', { name: 'Your table is open' }).waitFor();
  for (let i = 0; i < bots; i++) {
    await page.getByRole('button', { name: /Add a bot/ }).click();
    await page.waitForTimeout(100);
  }
  await page.waitForTimeout(500);
  await assertFit('lobby');
  await page.getByRole('button', { name: /Start game/ }).click();

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const keep = page.getByRole('button', { name: /Keep my cards/ });
    if (await keep.isVisible().catch(() => false)) {
      await assertFit('swap-sheet');
      await keep.click({ timeout: 2000 }).catch(() => {});
      continue;
    }
    if (await page.getByRole('heading', { name: 'Build your equation' }).isVisible().catch(() => false)) {
      await page.getByRole('radio', { name: /Both/ }).click();
      await page.waitForTimeout(300);
      await buildPool(page, 'small', 1);
      await buildPool(page, 'big', 20);
      await page.waitForTimeout(400);
      await assertFit('equation-both');
      await assertVisible('the Lock in button', page.getByRole('button', { name: /Lock in both equations/ }));
      await page.getByRole('button', { name: /Lock in both equations/ }).click();
      await page.getByText(/Why it paid out this way/).waitFor({ timeout: 40_000 });
      await page.waitForTimeout(1500);
      await assertFit('showdown');
      await assertVisible('Deal next hand', page.getByRole('button', { name: 'Deal next hand' }));
      return;
    }
    const act = page.getByRole('button', { name: /^(Check|Call)/ });
    if (await act.isVisible().catch(() => false)) {
      await page.waitForTimeout(400);
      await assertFit('betting');
      await assertVisible('your hand', page.locator('section[aria-label="Your hand"]'));
      await assertVisible('the Fold button', page.getByRole('button', { name: /Fold/ }));
      const raise = page.getByRole('button', { name: 'Raise', exact: true });
      // the most crowded table: in the final betting round raise once so every plate shows cards AND a bet
      const stepLabel = await page.locator('ol[aria-label^="Round progress"]').first().getAttribute('aria-label').catch(() => null);
      if (/step 5/.test(stepLabel ?? '') && !fits.has('late-raise') && (await raise.isEnabled().catch(() => false))) {
        fits.add('late-raise');
        await raise.click();
        await page.locator('#raise-amount').fill('30');
        await page.getByRole('button', { name: /Raise by 30/ }).click();
        await page.waitForTimeout(1500);
        await assertFit('final-round-bets-1');
        await page.waitForTimeout(2800);
        await assertFit('final-round-bets-2');
        continue;
      }
      if (!fits.has('betting-raise-open') && (await raise.isEnabled().catch(() => false))) {
        await raise.click();
        await page.waitForTimeout(400);
        await assertFit('betting-raise-open');
        await raise.click();
      }
      await act.click({ timeout: 3000 }).catch(() => {});
    }
    await page.waitForTimeout(200);
  }
  throw new Error(`${tag} ${bots + 1}p: did not reach the showdown`);
}

async function main() {
  const browser = await chromium.launch();
  for (const size of SIZES) {
    if (ONLY && !ONLY.includes(size.tag)) continue;
    for (const bots of BOTS) {
      const ctx = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        colorScheme: process.env.THEME === 'light' ? 'light' : 'dark',
      });
      const page = await ctx.newPage();
      page.on('console', (m) => m.type() === 'error' && errors.push(`[${size.tag}/${bots + 1}p] ${m.text()}`));
      page.on('pageerror', (e) => errors.push(`[${size.tag}/${bots + 1}p] ${e.message}`));
      await run(page, size.tag, bots);
      await ctx.close();
    }
  }
  await browser.close();
  if (errors.length) failures.push(...errors);
  if (failures.length) {
    console.error('\nFAILURES:\n' + failures.join('\n'));
    process.exit(1);
  }
  console.log('\nevery phase fits every viewport');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
