import { describe, expect, it } from 'vitest';
import {
  formatDateInStudio,
  formatInStudio,
  formatTimeInStudio,
  localDateTimeToUtc,
} from '../../packages/shared/src/time';

describe('fechas del estudio', () => {
  it('convierte una hora local de Buenos Aires a UTC', () => {
    const utc = localDateTimeToUtc('2026-11-03', '18:00');
    expect(utc.toISOString()).toBe('2026-11-03T21:00:00.000Z');
  });

  it('presenta un instante UTC en Buenos Aires', () => {
    expect(formatTimeInStudio('2026-11-03T21:00:00.000Z')).toBe('18:00');
    expect(formatDateInStudio('2026-11-04T02:30:00.000Z')).toContain('3 de noviembre');
    expect(formatTimeInStudio('2026-11-04T02:30:00.000Z')).toBe('23:30');
  });

  it('mantiene el cambio de día al formatear', () => {
    expect(formatDateInStudio('2026-11-04T02:30:00.000Z')).toContain('3 de noviembre');
    expect(formatTimeInStudio('2026-11-04T02:30:00.000Z')).toBe('23:30');
  });

  it('usa formato de 24 horas en los mensajes', () => {
    expect(formatInStudio('2026-11-03T21:00:00.000Z')).toContain('18:00');
  });
});
