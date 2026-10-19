/**
 * Raises preflop against slow bots so bet chips are on the table, then captures it.
 * Run the server with BOT_DELAY_MS=1200 or so.
 *   URL=http://localhost:3990 OUT=./shots npx tsx scripts/bets-shot.ts
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const URL = process.env.URL ?? 'http://localhost:3990';
const OUT = process.env.OUT ?? './shots';
mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch();
  const errors: string[] = [];
  for (const s of [
    { tag: 'm', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    { tag: 'd', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  ]) {
    const ctx = await browser.newContext({ ...s, colorScheme: 'dark' });
    const page = await ctx.newPage();
    page.on('console', (m) => m.type() === 'error' && errors.push(`[${s.tag}] ${m.text()}`));
    page.on('pageerror', (e) => errors.push(`[${s.tag}] ${e.message}`));
    await page.goto(URL);
    await page.getByLabel('Your name').fill('Ada');
    await page.getByRole('button', { name: /Create a table/ }).click();
    await page.getByRole('heading', { name: 'Your table is open' }).waitFor();
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: /Add a bot/ }).click();
      await page.waitForTimeout(150);
    }
    await page.getByRole('button', { name: /Start game/ }).click();
    await page.getByRole('button', { name: 'Raise', exact: true }).click();
    await page.locator('#raise-amount').fill('60');
    await page.getByRole('button', { name: /Raise by 60/ }).click();
    await page.waitForTimeout(1900);
    await page.screenshot({ path: `${OUT}/${s.tag}-bets-1.png` });
    await page.waitForTimeout(2600);
    await page.screenshot({ path: `${OUT}/${s.tag}-bets-2.png` });
    await ctx.close();
  }
  await browser.close();
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log('bet shots done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
