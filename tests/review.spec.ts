import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';

type Entry = {
  id: string;
  date: string;
  minutes: number;
  clientId: string;
  billable: boolean;
  description: string;
  employee: string;
  reviewed?: boolean;
};
const pilot = JSON.parse(
  readFileSync('src/fixtures/pilot-workspace.json', 'utf8'),
) as { entries: Entry[] };
const inWeek = pilot.entries.filter(
  (e) => e.date >= '2026-09-28' && e.date <= '2026-10-04',
);
const fmt = (minutes: number) => {
  const h = Math.floor(minutes / 60),
    m = minutes % 60;
  return `${h}h${m ? ` ${String(m).padStart(2, '0')}m` : ''}`;
};

async function openPilotReview(page: Page) {
  await page.goto('/');
  await page.evaluate(
    (data) => localStorage.setItem('counsel.time.v1', data),
    JSON.stringify(pilot),
  );
  await page.reload();
  await page.getByRole('button', { name: 'Weekly review' }).click();
  await expect(page.getByLabel('Review week', { exact: true })).toHaveValue(
    '2026-09-28',
  );
}
const row = (page: Page, id: string) => page.locator(`[data-entry-id="${id}"]`);
async function exportRows(page: Page) {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export view' }).click();
  const file = await (await downloading).path();
  return readFileSync(file, 'utf8').trim().split('\r\n').slice(1);
}

test('totals and export follow the active filters, not the selection', async ({
  page,
}) => {
  await openPilotReview(page);
  const meridian = inWeek.filter((e) => e.clientId === 'meridian');
  await page.getByLabel('Review client').selectOption('meridian');
  await expect(page.locator('.review-row')).toHaveCount(meridian.length);
  await expect(page.getByTestId('review-total')).toHaveText(
    fmt(meridian.reduce((n, e) => n + e.minutes, 0)),
  );
  const pending = meridian.filter((e) => !e.reviewed).length;
  await expect(
    page.getByRole('button', { name: `Show ${pending} needing review` }),
  ).toBeVisible();
  // Selecting one row must not change the export scope.
  await row(page, meridian[0].id).getByRole('checkbox').check();
  expect(await exportRows(page)).toHaveLength(meridian.length);

  await page.getByLabel('Review status').selectOption('reviewed');
  const reviewed = meridian.filter((e) => e.reviewed);
  await expect(page.locator('.review-row')).toHaveCount(reviewed.length);
  const rows = await exportRows(page);
  expect(rows).toHaveLength(reviewed.length);
  for (const line of rows) expect(line).toContain('"Meridian Holdings"');
});

test('selection is narrowed and explained when filters change', async ({
  page,
}) => {
  await openPilotReview(page);
  await page.getByLabel('Select visible entries').check();
  await expect(page.locator('.selection-count')).toHaveText(
    `${inWeek.length} of ${inWeek.length} selected`,
  );
  const meridian = inWeek.filter((e) => e.clientId === 'meridian');
  await page.getByLabel('Review client').selectOption('meridian');
  await expect(page.locator('.selection-count')).toHaveText(
    `${meridian.length} of ${meridian.length} selected`,
  );
  await expect(page.locator('.review-notice')).toContainText(
    `${inWeek.length - meridian.length} entries left the view and were deselected`,
  );
  await expect(page.getByTestId('action-scope')).toContainText(
    `will apply to ${meridian.length} entries`,
  );
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(scan.violations.map((v) => v.id)).toEqual([]);
  await page.screenshot({
    path: 'test-results/review-selection.png',
    fullPage: true,
  });
});

test('a client correction requires review again; undo never erases newer work', async ({
  page,
}) => {
  await openPilotReview(page);
  const target = row(page, 'entry-001');
  await expect(target.locator('.review-state')).toHaveText(/Reviewed/);
  await target.getByRole('checkbox').check();
  await page.getByLabel('Bulk action').selectOption('client');
  await page.getByLabel('Destination client').selectOption('foundation');
  await page.getByRole('button', { name: 'Apply to 1 selected' }).click();
  await expect(target).toContainText('Meridian Foundation');
  await expect(target.locator('.review-state')).toHaveText(/Needs review/);

  // A newer correction to the same entry through the edit form.
  await target.getByRole('button', { name: /Edit review entry/ }).click();
  await page.getByLabel('Description').fill('Shareholder agreement review v2');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('button', { name: 'Undo last action' }).click();
  await expect(page.getByRole('alert')).toContainText('Undo was not applied');
  await expect(target).toContainText('Meridian Foundation');
  await expect(target).toContainText('Shareholder agreement review v2');
});

test('undo reverts the review action but keeps independent edits', async ({
  page,
}) => {
  await openPilotReview(page);
  await row(page, 'entry-001').getByRole('checkbox').check();
  await page.getByLabel('Bulk action').selectOption('client');
  await page.getByLabel('Destination client').selectOption('foundation');
  await page.getByRole('button', { name: 'Apply to 1 selected' }).click();
  // Independent edit to another entry.
  await row(page, 'entry-002')
    .getByRole('button', { name: /Edit review entry/ })
    .click();
  await page.getByLabel('Description').fill('Weekly team planning (Q4)');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('button', { name: 'Undo last action' }).click();
  await expect(row(page, 'entry-001')).toContainText('Meridian Holdings');
  await expect(row(page, 'entry-001').locator('.review-state')).toHaveText(
    /Reviewed/,
  );
  await expect(row(page, 'entry-002')).toContainText(
    'Weekly team planning (Q4)',
  );
});

test('editing only the description keeps internal work non-billable', async ({
  page,
}) => {
  await openPilotReview(page);
  const target = row(page, 'entry-002');
  await expect(target).toContainText('Non-billable');
  await target.getByRole('button', { name: /Edit review entry/ }).click();
  await page.getByLabel('Description').fill('Weekly team planning meeting');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(target).toContainText('Weekly team planning meeting');
  await expect(target).toContainText('Non-billable');
});
