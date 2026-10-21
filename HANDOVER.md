# Release handover

## Changed

All three reports were fixed at their root cause:

- **Edit flipped billability** – the edit form always started with `billable = true` ([EntryForm.tsx](src/components/EntryForm.tsx)). It now loads the entry's value.
- **Totals/export ignored filters** – both used every entry in the week. They now use the visible (filtered) rows, regardless of selection.
- **Corrections stayed "Reviewed"** – bulk client/billability changes now return actually-changed entries to _Needs review_. Unchanged entries keep their status ([review.ts](src/review.ts)).
- **Undo reverted unrelated work** – it restored a whole-workspace snapshot. It now records before/after per entry and reverts only those entries. If any of them changed or were deleted since, it reverts nothing and explains why.

**Workflow improvement – clear action scope.** Actions only touch selected rows that are visible. When filters change, rows that leave the view are deselected, with a message. A scope line states exactly what _Apply_ will do (e.g. "Mark reviewed will apply to 5 entries (6h 30m)"). The header checkbox shows a partial selection. A "Show N needing review" shortcut covers Sofia's optional request.

**Optional requests.**

- **Dark theme**: a toggle in the top bar, stored per browser and not in backups. The default follows the system setting. [scripts/dark-theme.mjs](scripts/dark-theme.mjs) generates it from the unchanged light stylesheet (`npm run theme:dark`), with small hand-tuned overrides.
- **Repeat yesterday**: the new-entry form lists Alex's entries from the most recent earlier day, up to a week back. Picking one fills in the form; nothing is saved until _Save entry_.

## Verified

- `npm run check`: 38 unit tests pass (new: [review.test.ts](src/review.test.ts), [EntryForm.test.tsx](src/components/EntryForm.test.tsx)), plus build and Prettier.
- `npm run test:e2e`: 24/24 on desktop and mobile Chromium. [review.spec.ts](tests/review.spec.ts) replays each report on the pilot workspace, including CSV content, undo conflicts, and an axe scan of the review page. [theme.spec.ts](tests/theme.spec.ts) runs axe WCAG AA scans on every page and the entry dialog in dark mode. [repeat.spec.ts](tests/repeat.spec.ts) covers repeating an entry.
- The new browser tests fail (5/5) on the original code, and the form test fails without its fix.
- Dark-mode screenshots were checked by eye; hover/focus states were not checked exhaustively.
- Not tested: Safari/Firefox, real screen readers, two tabs open at once during undo.

## Remaining

- Undo lives in page state only, and is lost when you leave Weekly review.
- The form trims descriptions. Saving an "unchanged" entry whose stored description has outer whitespace would require review again.
- Repeat copies one entry at a time; there is no "repeat the whole day".

## Release recommendation

Release to the pilot. The reported data-integrity issues are fixed and covered by tests. Limitations: the above, and no audit trail of review changes.

## AI use

Claude Code (agent) investigated the code, implemented the fixes, and wrote the tests. Example check: its first undo-conflict test failed. Investigation showed the test was wrong, not the app: the edited entry was already reviewed, so "Mark reviewed" never changed it. The test was corrected to target an entry the action actually changed, and now asserts which entries undo records.
