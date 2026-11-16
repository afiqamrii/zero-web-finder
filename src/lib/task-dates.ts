import { malaysiaDayStart } from './domain';

export function taskDayBounds(now = new Date()) {
  const start = malaysiaDayStart(now);
  return { now, start, tomorrow: new Date(start.getTime() + 86400000) };
}

export function toMytDateTime(value: string | Date) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 16);
}

export function fromMytDateTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Choose a due date and time in Malaysia time.');
  const date = new Date(`${value}:00+08:00`);
  if (!Number.isFinite(date.getTime()) || toMytDateTime(date) !== value) throw new Error('Choose a valid due date and time in Malaysia time.');
  return date.toISOString();
}
