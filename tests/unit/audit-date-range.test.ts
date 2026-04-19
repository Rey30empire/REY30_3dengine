import { describe, expect, it } from 'vitest';
import { resolveDateRange } from '@/lib/server/audit-date-range';

describe('resolveDateRange', () => {
  it('accepts dateFrom/dateTo aliases and parses them into timestamps', () => {
    const result = resolveDateRange(
      new URLSearchParams({
        dateFrom: '2026-04-18T09:00:00.000Z',
        dateTo: '2026-04-18T10:00:00.000Z',
      })
    );

    expect(result).toMatchObject({
      from: '2026-04-18T09:00:00.000Z',
      to: '2026-04-18T10:00:00.000Z',
      fromMs: Date.parse('2026-04-18T09:00:00.000Z'),
      toMs: Date.parse('2026-04-18T10:00:00.000Z'),
    });
  });

  it('prefers from/to when canonical and alias query params are both present', () => {
    const result = resolveDateRange(
      new URLSearchParams({
        from: '2026-04-18T11:00:00.000Z',
        dateFrom: '2026-04-18T09:00:00.000Z',
        to: '2026-04-18T12:00:00.000Z',
        dateTo: '2026-04-18T10:00:00.000Z',
      })
    );

    expect(result).toMatchObject({
      from: '2026-04-18T11:00:00.000Z',
      to: '2026-04-18T12:00:00.000Z',
    });
  });

  it('rejects invalid dates and inverted ranges', () => {
    expect(resolveDateRange(new URLSearchParams({ dateFrom: 'nope' }))).toEqual({
      error: 'from debe ser una fecha válida.',
    });
    expect(
      resolveDateRange(
        new URLSearchParams({
          dateFrom: '2026-04-18T12:00:00.000Z',
          dateTo: '2026-04-18T11:00:00.000Z',
        })
      )
    ).toEqual({
      error: 'from debe ser menor o igual a to.',
    });
  });
});
