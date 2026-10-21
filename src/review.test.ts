import { describe, expect, it } from 'vitest';
import { decodeData, totals } from './model';
import type { Data } from './model';
import pilot from './fixtures/pilot-workspace.json';
import {
  previousDayEntries,
  saveEntry,
  selectReview,
  undoEntries,
  updateEntries,
} from './review';

const fixture = (): Data => decodeData(JSON.stringify(pilot));
const find = (data: Data, id: string) => data.entries.find((e) => e.id === id)!;
const WEEK = '2026-09-28';

describe('review corrections', () => {
  it('returns a reviewed entry to review when its client is corrected', () => {
    const data = fixture();
    expect(find(data, 'entry-001').reviewed).toBe(true);
    const { data: next } = updateEntries(data, ['entry-001'], {
      clientId: 'foundation',
    });
    expect(find(next, 'entry-001')).toMatchObject({
      clientId: 'foundation',
      reviewed: false,
    });
  });
  it('returns a reviewed entry to review when billability is corrected', () => {
    const data = fixture();
    const { data: next } = updateEntries(data, ['entry-001'], {
      billable: false,
    });
    expect(find(next, 'entry-001').reviewed).toBe(false);
  });
  it('keeps review status when the correction changes nothing', () => {
    const data = fixture();
    const result = updateEntries(data, ['entry-001'], { clientId: 'meridian' });
    expect(find(result.data, 'entry-001').reviewed).toBe(true);
    expect(result.undo.changes).toHaveLength(0);
  });
  it('marks entries reviewed explicitly', () => {
    const data = fixture();
    const { data: next } = updateEntries(data, ['entry-002'], {
      reviewed: true,
    });
    expect(find(next, 'entry-002').reviewed).toBe(true);
  });
  it('preserves billability and review when saving an unchanged form', () => {
    const data = fixture();
    const original = find(data, 'entry-001');
    const next = saveEntry(data, { ...original }, undefined, original);
    expect(find(next, 'entry-001').reviewed).toBe(true);
  });
  it('requires review again after a description edit', () => {
    const data = fixture();
    const original = find(data, 'entry-002');
    const next = saveEntry(
      data,
      { ...original, description: 'Weekly team planning (internal)' },
      undefined,
      original,
    );
    expect(find(next, 'entry-002')).toMatchObject({
      billable: false,
      reviewed: false,
    });
  });
});

describe('undo of review actions', () => {
  it('reverts only the affected entries and keeps independent work', () => {
    const data = fixture();
    const action = updateEntries(data, ['entry-001'], {
      clientId: 'foundation',
    });
    // Independent later work on a different entry.
    const other = find(action.data, 'entry-002');
    const later = saveEntry(
      action.data,
      { ...other, description: 'Team planning' },
      undefined,
      other,
    );
    const undone = undoEntries(later, action.undo);
    expect(find(undone, 'entry-001')).toEqual(find(data, 'entry-001'));
    expect(find(undone, 'entry-002').description).toBe('Team planning');
  });
  it('declines undo when an affected entry was changed since', () => {
    const data = fixture();
    const action = updateEntries(data, ['entry-001', 'entry-002'], {
      reviewed: true,
    });
    // entry-001 was already reviewed, so only entry-002 is in the undo record.
    expect(action.undo.changes.map((c) => c.after.id)).toEqual(['entry-002']);
    const entry = find(action.data, 'entry-002');
    const later = saveEntry(
      action.data,
      { ...entry, minutes: 120 },
      undefined,
      entry,
    );
    expect(() => undoEntries(later, action.undo)).toThrow(
      'Undo was not applied',
    );
  });
  it('declines undo when an affected entry was deleted', () => {
    const data = fixture();
    const action = updateEntries(data, ['entry-001'], { reviewed: false });
    const later = {
      ...action.data,
      entries: action.data.entries.filter((e) => e.id !== 'entry-001'),
    };
    expect(() => undoEntries(later, action.undo)).toThrow();
  });
});

describe('review view scope', () => {
  it('limits rows and totals to the active filters', () => {
    const data = fixture();
    const filters = {
      week: WEEK,
      clientId: 'meridian',
      employee: 'all',
      status: 'all',
      search: '',
    };
    const visible = selectReview(data.entries, data.clients, filters);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.every((e) => e.clientId === 'meridian')).toBe(true);
    expect(visible.every((e) => e.date >= WEEK && e.date <= '2026-10-04')).toBe(
      true,
    );
    expect(totals(visible).total).toBe(
      visible.reduce((n, e) => n + e.minutes, 0),
    );
  });
});

describe('repeat a previous entry', () => {
  it("offers the employee's most recent earlier working day", () => {
    const data = fixture();
    // Monday 5 Oct: the last earlier day with Alex's work is in the pilot week.
    const result = previousDayEntries(
      data.entries,
      '2026-10-05',
      'Alex Morgan',
    );
    expect(result).not.toBeNull();
    expect(result!.date < '2026-10-05').toBe(true);
    expect(result!.entries.length).toBeGreaterThan(0);
    expect(
      result!.entries.every(
        (e) => e.employee === 'Alex Morgan' && e.date === result!.date,
      ),
    ).toBe(true);
    const later = data.entries.filter(
      (e) =>
        e.employee === 'Alex Morgan' &&
        e.date > result!.date &&
        e.date < '2026-10-05',
    );
    expect(later).toEqual([]);
  });
  it('ignores other employees, the same day, and work older than a week', () => {
    const data = fixture();
    const first = data.entries.map((e) => e.date).sort()[0];
    expect(previousDayEntries(data.entries, first, 'Alex Morgan')).toBeNull();
    expect(
      previousDayEntries(data.entries, '2026-12-01', 'Alex Morgan'),
    ).toBeNull();
    expect(previousDayEntries(data.entries, '2026-10-05', 'Nobody')).toBeNull();
  });
});
