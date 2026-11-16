import { describe, expect, it } from 'vitest';
import { automationSummary, nextSendingWindow } from './dashboard';

const weekdays = { sendStartHour: 9, sendEndHour: 17, weekdaysOnly: true };
const day = (value: string) => new Date(value);

describe('Malaysia sending schedule shown on the dashboard', () => {
  it('uses the opening boundary and excludes the closing boundary', () => {
    expect(nextSendingWindow(weekdays, day('2026-11-16T00:59:59Z'))?.toISOString()).toBe('2026-11-16T01:00:00.000Z');
    expect(nextSendingWindow(weekdays, day('2026-11-16T01:00:00Z'))?.toISOString()).toBe('2026-11-16T01:00:00.000Z');
    expect(nextSendingWindow(weekdays, day('2026-11-16T08:59:59Z'))?.toISOString()).toBe('2026-11-16T08:59:59.000Z');
    expect(nextSendingWindow(weekdays, day('2026-11-16T09:00:00Z'))?.toISOString()).toBe('2026-11-17T01:00:00.000Z');
  });

  it('skips the weekend only when weekday sending is selected', () => {
    expect(nextSendingWindow(weekdays, day('2026-11-20T09:00:00Z'))?.toISOString()).toBe('2026-11-23T01:00:00.000Z');
    expect(nextSendingWindow(weekdays, day('2026-11-22T02:00:00Z'))?.toISOString()).toBe('2026-11-23T01:00:00.000Z');
    expect(nextSendingWindow({ ...weekdays, weekdaysOnly: false }, day('2026-11-20T09:00:00Z'))?.toISOString()).toBe('2026-11-21T01:00:00.000Z');
  });

  it('handles midnight in Malaysia when the UTC calendar date is still Sunday', () => {
    const allDay = { sendStartHour: 0, sendEndHour: 24, weekdaysOnly: true };
    expect(nextSendingWindow(allDay, day('2026-11-22T15:59:59Z'))?.toISOString()).toBe('2026-11-22T16:00:00.000Z');
    expect(nextSendingWindow(allDay, day('2026-11-22T16:00:00Z'))?.toISOString()).toBe('2026-11-22T16:00:00.000Z');
  });
});

describe('honest automation status', () => {
  const available = {
    settings: { ...weekdays, sendingEnabled: true, dailyLimit: 20, lastWorkerError: null as string | null },
    workerOnline: true, blockers: [] as string[], today: 0, campaigns: 1, now: day('2026-11-16T02:00:00Z'),
  };

  it('does not report enabled sending when setup, master switch, worker, or reply checks prevent it', () => {
    expect(automationSummary({ ...available, blockers: ['Connect Gmail'] }).state).toBe('setup');
    expect(automationSummary({ ...available, settings: { ...available.settings, sendingEnabled: false } }).state).toBe('paused');
    expect(automationSummary({ ...available, workerOnline: false }).state).toBe('offline');
    expect(automationSummary({ ...available, settings: { ...available.settings, lastWorkerError: 'Reply checks failed' } }).state).toBe('error');
    expect(automationSummary(available).state).toBe('ready');
  });

  it('distinguishes a schedule wait from having no approved campaigns', () => {
    expect(automationSummary({ ...available, campaigns: 0 }).state).toBe('idle');
    const outsideHours = automationSummary({ ...available, now: day('2026-11-16T10:00:00Z') });
    expect(outsideHours.state).toBe('scheduled');
    expect(outsideHours.nextWindowAt).toBe('2026-11-17T01:00:00.000Z');
  });

  it('shows the next allowance window, never the current window, when the daily limit is exhausted', () => {
    const limited = automationSummary({ ...available, today: 20, now: day('2026-11-20T02:00:00Z') });
    expect(limited.state).toBe('limit');
    expect(limited.nextWindowAt).toBe('2026-11-23T01:00:00.000Z');
    const allDays = automationSummary({ ...available, settings: { ...available.settings, weekdaysOnly: false, sendStartHour: 0, sendEndHour: 24 }, today: 25 });
    expect(allDays.nextWindowAt).toBe('2026-11-16T16:00:00.000Z');
  });
});
