import { DateTime } from 'luxon';

export const STUDIO_TIMEZONE = 'America/Argentina/Buenos_Aires';

export function localDateTimeToUtc(date: string, time: string, zone = STUDIO_TIMEZONE): Date {
  const value = DateTime.fromISO(`${date}T${time}`, { zone });
  if (!value.isValid) {
    throw new Error(`Fecha u hora inválida: ${date} ${time} (${value.invalidReason})`);
  }
  return value.toUTC().toJSDate();
}

export function toUtcIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

export function formatInStudio(
  value: Date | string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'full', timeStyle: 'short' },
): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: STUDIO_TIMEZONE,
    hourCycle: 'h23',
    ...options,
  }).format(date);
}

export function formatDateInStudio(value: Date | string): string {
  return formatInStudio(value, { dateStyle: 'full' });
}

export function formatTimeInStudio(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: STUDIO_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

export function addDays(value: Date, days: number): Date {
  return DateTime.fromJSDate(value, { zone: STUDIO_TIMEZONE }).plus({ days }).toJSDate();
}

export function hoursBetween(from: Date, to: Date): number {
  return DateTime.fromJSDate(to).diff(DateTime.fromJSDate(from), 'hours').hours;
}

export function isPast(value: Date, now = new Date()): boolean {
  return value.getTime() <= now.getTime();
}

export function packageExpiry(purchasedAt: Date, validityDays: number | null): Date | null {
  if (validityDays === null) {
    return null;
  }
  return addDays(purchasedAt, validityDays);
}
