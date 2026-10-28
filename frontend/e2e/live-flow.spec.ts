import { expect, test } from '@playwright/test';

test('creates a league, follows live play through refresh, then sees the final table', async ({ page }) => {
  await page.goto('/leagues/new');
  await page.getByLabel('LEAGUE NAME').fill(`E2E league ${Date.now()}`);
  await page.getByLabel('SEASON LABEL').fill('Smoke season');
  await page.getByRole('button', { name: 'Kick off the season' }).click();

  await expect(page.getByRole('heading', { name: /E2E league/ })).toBeVisible();
  await page.getByRole('button', { name: 'Kick off matchday' }).click();
  const liveHubLink = page.getByRole('link', { name: /Live matchday/ });
  await expect(liveHubLink).toBeVisible();
  await liveHubLink.click();
  await expect(page.locator('.live-scoreboard').first()).toBeVisible();
  await page.locator('.live-scoreboard').first().click();

  await expect(page.locator('.match-page-status')).toHaveText('LIVE');
  await expect(page.getByRole('status').filter({ hasText: 'GOAL' })).toBeVisible({ timeout: 70_000 });
  const clock = page.locator('.match-page-scoreboard p');
  await expect.poll(async () => Number.parseInt((await clock.textContent()) ?? '0', 10)).toBeGreaterThan(10);
  const beforeReload = Number.parseInt((await clock.textContent()) ?? '0', 10);
  await page.reload();
  await expect(page.locator('.match-page-status')).toHaveText('LIVE');
  await expect.poll(async () => Number.parseInt((await clock.textContent()) ?? '0', 10)).toBeGreaterThanOrEqual(beforeReload);

  await expect(page.locator('.match-page-status')).toHaveText('FULL TIME', { timeout: 60_000 });
  const leaguePath = new URL(page.url()).pathname.split('/').filter(Boolean);
  const leagueId = await page.getByRole('link', { name: 'Live hub' }).getAttribute('href');
  expect(leaguePath[0]).toBe('matches');
  expect(leagueId).toMatch(/^\/leagues\/\d+\/live$/);
  await page.goto(`/leagues/${leagueId?.split('/')[2]}/table`);
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.locator('.standings-table tbody tr').first().locator('td').nth(2)).not.toHaveText('0');
});
