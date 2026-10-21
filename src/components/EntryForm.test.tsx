import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntryForm } from './EntryForm';
import type { Entry } from '../model';

const clients = [{ id: 'internal', name: 'Firm · Internal', color: '#52735a' }];
const entry: Entry = {
  id: 'entry-002',
  date: '2026-09-28',
  minutes: 45,
  clientId: 'internal',
  billable: false,
  description: 'Weekly team planning',
  employee: 'Alex Morgan',
  reviewed: false,
};

afterEach(cleanup);
// jsdom does not implement <dialog> modality.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.open = true;
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.open = false;
};

describe('EntryForm', () => {
  it('keeps a non-billable entry non-billable when only the description changes', () => {
    const onSave = vi.fn();
    render(
      <EntryForm
        entry={entry}
        clients={clients}
        onSave={onSave}
        onClose={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText(/Description/), {
      target: { value: 'Weekly team planning and priorities' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({
      billable: false,
      clientId: 'internal',
      minutes: 45,
      date: '2026-09-28',
      description: 'Weekly team planning and priorities',
    });
  });
  it('fills a new entry from the previous day without saving it', () => {
    const onSave = vi.fn();
    const yesterday = { ...entry, id: 'y', date: '2026-10-20', reviewed: true };
    render(
      <EntryForm
        clients={clients}
        entries={[yesterday]}
        onSave={onSave}
        onClose={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText('Date', { selector: 'input' }), {
      target: { value: '2026-10-21' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /Repeat Firm · Internal/ }),
    );
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Description/)).toHaveValue(
      'Weekly team planning',
    );
    fireEvent.click(screen.getByRole('button', { name: /Save entry/ }));
    const saved = onSave.mock.calls[0][0];
    expect(saved).toMatchObject({
      date: '2026-10-21',
      minutes: 45,
      clientId: 'internal',
      billable: false,
      description: 'Weekly team planning',
      employee: 'Alex Morgan',
    });
    expect(saved.id).not.toBe('y');
    expect(saved.reviewed).toBeUndefined();
  });
});
