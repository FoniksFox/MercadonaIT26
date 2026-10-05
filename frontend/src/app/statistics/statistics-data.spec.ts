import { Supermarket } from '../core/supermarkets';
import { OPENING_HOURS, buildStats } from './statistics-data';

const STORE: Supermarket = { id: 'test', name: 'Test', city: 'Test', busyness: 1 };

describe('buildStats', () => {
  it('should only have figures for the hours of today that are over', () => {
    const halfPastEleven = new Date(2026, 9, 5, 11, 30);

    const stats = buildStats(STORE, 'today', halfPastEleven);

    // 9:00 and 10:00 are complete; 11:00 is still running.
    expect(stats.hourly.map((value) => value !== null)).toEqual([
      true,
      true,
      ...OPENING_HOURS.slice(2).map(() => false),
    ]);
    expect(stats.visitors).toBe((stats.hourly[0] ?? 0) + (stats.hourly[1] ?? 0));
    expect(stats.hourlyReference).toHaveLength(OPENING_HOURS.length);
    expect(stats.weekGrid).toBeNull();
  });

  it('should cover every opening hour and weekday for a past week', () => {
    const stats = buildStats(STORE, 'week');

    expect(stats.hourly.every((value) => value !== null)).toBe(true);
    expect(stats.hourlyReference).toBeNull();
    expect(stats.weekGrid).toHaveLength(6);
    expect(stats.weekGrid![0].values).toHaveLength(OPENING_HOURS.length);
  });

  it('should rank zones, leaving the tills out of the visits', () => {
    const stats = buildStats(STORE, 'month');
    const visits = stats.visitsByZone.map((row) => row.value);

    expect(stats.visitsByZone.some((row) => row.zone.id === 'checkout')).toBe(false);
    expect(visits).toEqual([...visits].sort((a, b) => b - a));
    expect(stats.mostVisited).toBe(stats.visitsByZone[0].zone);
    expect(stats.stayByZone).toHaveLength(10);
  });

  it('should give the same figures for the same store and range', () => {
    expect(buildStats(STORE, 'week')).toEqual(buildStats(STORE, 'week'));
    expect(buildStats({ ...STORE, id: 'other' }, 'week').visitors).not.toBe(
      buildStats(STORE, 'week').visitors,
    );
  });
});
