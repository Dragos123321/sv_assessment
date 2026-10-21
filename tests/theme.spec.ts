import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function violations(page: Page) {
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return scan.violations.map((v) => ({
    id: v.id,
    nodes: v.nodes.map((n) => ({
      target: n.target,
      summary: n.failureSummary,
    })),
  }));
}

test('dark theme persists and every page passes WCAG AA checks', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Load a sample workspace/ }).click();
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  // The display preference is not part of the workspace backup.
  expect(
    await page.evaluate(() => localStorage.getItem('counsel.time.v1')),
  ).not.toContain('theme');

  for (const name of ['Time entries', 'Weekly review', 'Reports', 'Clients']) {
    await page.getByRole('button', { name, exact: true }).click();
    if (name === 'Weekly review')
      await page.getByLabel('Select visible entries').check();
    await page.screenshot({
      path: `test-results/dark-${info.project.name}-${name.replace(' ', '-')}.png`,
      fullPage: true,
    });
    expect(await violations(page), name).toEqual([]);
  }
  await page.getByRole('button', { name: 'Time entries', exact: true }).click();
  await page.getByRole('button', { name: 'Log time', exact: true }).click();
  await page.screenshot({
    path: `test-results/dark-${info.project.name}-dialog.png`,
  });
  expect(await violations(page), 'entry dialog').toEqual([]);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
