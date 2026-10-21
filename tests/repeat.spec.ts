import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

type Entry = {
  id: string;
  date: string;
  minutes: number;
  clientId: string;
  billable: boolean;
  description: string;
  employee: string;
};
const pilot = JSON.parse(
  readFileSync('src/fixtures/pilot-workspace.json', 'utf8'),
) as { clients: { id: string; name: string }[]; entries: Entry[] };

test('repeat the previous working day’s entry into a new one', async ({
  page,
}) => {
  const alex = pilot.entries.filter(
    (e) => e.employee === 'Alex Morgan' && e.date < '2026-10-05',
  );
  const lastDay = alex
    .map((e) => e.date)
    .sort()
    .at(-1)!;
  const source = alex
    .filter((e) => e.date === lastDay)
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  const client = pilot.clients.find((c) => c.id === source.clientId)!;

  await page.goto('/');
  await page.evaluate(
    (data) => localStorage.setItem('counsel.time.v1', data),
    JSON.stringify(pilot),
  );
  await page.reload();
  await page
    .getByRole('button', { name: 'Log time', exact: true })
    .first()
    .click();
  await page.getByLabel('Date', { exact: true }).fill('2026-10-05');
  await page
    .getByRole('button', {
      name: `Repeat ${client.name}: ${source.description}`,
      exact: false,
    })
    .click();
  await expect(page.getByLabel('Description')).toHaveValue(source.description);
  // Nothing is stored until the user saves.
  expect(
    await page.evaluate(() => localStorage.getItem('counsel.time.v1')),
  ).toBe(JSON.stringify(pilot));
  await page.getByRole('button', { name: 'Save entry', exact: true }).click();

  const stored = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('counsel.time.v1')!) as {
        entries: (Entry & { reviewed?: boolean })[];
      },
  );
  expect(stored.entries).toHaveLength(pilot.entries.length + 1);
  const created = stored.entries.find(
    (e) => !pilot.entries.some((p) => p.id === e.id),
  )!;
  expect(created).toMatchObject({
    date: '2026-10-05',
    clientId: source.clientId,
    minutes: source.minutes,
    billable: source.billable,
    description: source.description,
    employee: 'Alex Morgan',
    reviewed: false,
  });
});
