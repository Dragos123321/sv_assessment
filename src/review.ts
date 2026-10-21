import type { Client, Data, Entry } from './model';
import { addDays, validateEntry } from './model';

export type ReviewFilters = {
  week: string;
  clientId: string;
  employee: string;
  status: string;
  search: string;
};
export type EntryPatch = Partial<
  Pick<Entry, 'clientId' | 'billable' | 'reviewed'>
>;
/** Per-entry record of a review action: the entry before and after it. */
export type UndoRecord = { changes: { before: Entry; after: Entry }[] };

export function selectWeek(entries: Entry[], week: string) {
  return entries.filter(
    (entry) => entry.date >= week && entry.date <= addDays(week, 6),
  );
}
export function selectReview(
  entries: Entry[],
  clients: Client[],
  filters: ReviewFilters,
) {
  return selectWeek(entries, filters.week)
    .filter(
      (entry) =>
        (filters.clientId === 'all' || entry.clientId === filters.clientId) &&
        (filters.employee === 'all' || entry.employee === filters.employee) &&
        (filters.status === 'all' ||
          !!entry.reviewed === (filters.status === 'reviewed')) &&
        `${entry.description} ${clients.find((c) => c.id === entry.clientId)?.name ?? ''} ${entry.employee}`
          .toLowerCase()
          .includes(filters.search.toLowerCase()),
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.employee.localeCompare(b.employee) ||
        a.id.localeCompare(b.id),
    );
}
/** True when any field that a review vouches for differs. */
export function meaningfulChange(previous: Entry, next: Entry) {
  return (
    previous.date !== next.date ||
    previous.minutes !== next.minutes ||
    previous.clientId !== next.clientId ||
    previous.billable !== next.billable ||
    previous.description !== next.description ||
    previous.employee !== next.employee
  );
}
export function sameEntry(a: Entry, b: Entry) {
  return !meaningfulChange(a, b) && !!a.reviewed === !!b.reviewed;
}
export function applyEntryUpdate(previous: Entry, next: Entry): Entry {
  return {
    ...next,
    reviewed: meaningfulChange(previous, next) ? false : previous.reviewed,
  };
}
export function saveEntry(
  data: Data,
  entry: Entry,
  client?: Client,
  original?: Entry,
): Data {
  const previous = data.entries.find((e) => e.id === entry.id);
  if (
    original &&
    (!previous || JSON.stringify(previous) !== JSON.stringify(original))
  )
    throw new Error(
      'This entry changed while you were editing. Close and reopen it to use the latest version.',
    );
  const clients = client ? [...data.clients, client] : data.clients;
  validateEntry(entry, clients);
  return {
    ...data,
    clients,
    entries: [
      ...data.entries.filter((e) => e.id !== entry.id),
      previous
        ? applyEntryUpdate(previous, entry)
        : { ...entry, reviewed: false },
    ],
  };
}
/**
 * Applies a review action. A correction (client or billability) that actually
 * changes an entry returns it to review unless the patch sets `reviewed` itself.
 * Returns the new data plus an undo record of only the entries that changed.
 */
export function updateEntries(
  data: Data,
  ids: string[],
  patch: EntryPatch,
): { data: Data; undo: UndoRecord } {
  const selected = new Set(ids);
  if (ids.some((id) => !data.entries.some((e) => e.id === id)))
    throw new Error('An entry no longer exists. Refresh your selection.');
  const changes: UndoRecord['changes'] = [];
  const entries = data.entries.map((entry) => {
    if (!selected.has(entry.id)) return entry;
    let merged: Entry = { ...entry, ...patch };
    if (patch.reviewed === undefined && meaningfulChange(entry, merged))
      merged = { ...merged, reviewed: false };
    validateEntry(merged, data.clients);
    if (sameEntry(entry, merged)) return entry;
    changes.push({ before: entry, after: merged });
    return merged;
  });
  return { data: { ...data, entries }, undo: { changes } };
}
/**
 * Reverts only the entries touched by the operation. If any of them has been
 * changed or deleted since, nothing is reverted and an explanation is thrown,
 * so newer work is never silently overwritten.
 */
export function undoEntries(data: Data, operation: UndoRecord): Data {
  const conflicts = operation.changes.filter(({ after }) => {
    const current = data.entries.find((e) => e.id === after.id);
    return !current || !sameEntry(current, after);
  });
  if (conflicts.length)
    throw new Error(
      `Undo was not applied because ${
        conflicts.length === 1
          ? 'an entry it would revert has'
          : `${conflicts.length} entries it would revert have`
      } changed since: ${conflicts
        .map((c) => `“${c.before.description || 'untitled entry'}”`)
        .join(', ')}. Nothing was reverted; correct the entries directly.`,
    );
  if (
    operation.changes.some(
      ({ before }) => !data.clients.some((c) => c.id === before.clientId),
    )
  )
    throw new Error(
      'Undo was not applied: an original client no longer exists.',
    );
  const before = new Map(operation.changes.map((c) => [c.before.id, c.before]));
  return {
    ...data,
    entries: data.entries.map((e) => before.get(e.id) ?? e),
  };
}
/**
 * The employee's entries from their most recent working day before `date`
 * (looking back up to a week, so Monday offers Friday's work).
 */
export function previousDayEntries(
  entries: Entry[],
  date: string,
  employee: string,
): { date: string; entries: Entry[] } | null {
  const earlier = entries.filter(
    (e) =>
      e.employee === employee && e.date < date && e.date >= addDays(date, -7),
  );
  const last = earlier
    .map((e) => e.date)
    .sort()
    .at(-1);
  if (!last) return null;
  return {
    date: last,
    entries: earlier
      .filter((e) => e.date === last)
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}
