import { Supermarket } from '../core/supermarkets';
import { assess } from './staffing';
import { buildStaffingHistory } from './staffing-history';

const BUSY: Supermarket = { id: 'busy', name: 'Busy', city: 'Test', busyness: 1.3 };
const QUIET: Supermarket = { id: 'quiet', name: 'Quiet', city: 'Test', busyness: 0.4 };
/** A Monday at half past eleven: 9:00 and 10:00 are over. */
const MONDAY_MORNING = new Date(2026, 9, 5, 11, 30);

describe('assess', () => {
  it('should grade a zone by how many customers its staff can attend', () => {
    // One person at a counter attends three customers.
    expect(assess('bakery', 1, 1)).toMatchObject({ coverage: 'covered', missing: 0 });
    expect(assess('bakery', 3, 1)).toMatchObject({ coverage: 'tight', missing: 0 });
    expect(assess('bakery', 5, 1)).toMatchObject({ coverage: 'short', missing: 1 });
  });

  it('should never ask for more tills than the store has', () => {
    expect(assess('checkout', 100, 4)).toMatchObject({ coverage: 'short', missing: 2 });
  });
});

describe('buildStaffingHistory', () => {
  it('should cover every weekday and opening hour for a week', () => {
    const history = buildStaffingHistory(BUSY, 'week', MONDAY_MORNING);

    expect(history.grid.map((row) => row.label)).toEqual([
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábado',
    ]);
    expect(history.hours).toHaveLength(13);
    expect(history.grid.every((row) => row.values.length === 13)).toBe(true);
    expect(history.zones).toHaveLength(10);
  });

  it('should rank zones by hours short and recommend a change only where staff was missing', () => {
    const history = buildStaffingHistory(BUSY, 'month', MONDAY_MORNING);
    const hours = history.zones.map((row) => row.shortHours);

    expect(hours).toEqual([...hours].sort((a, b) => b - a));
    expect(history.worstZone).toBe(history.zones[0].zone);
    expect(history.shortHours).toBeGreaterThan(0);
    expect(history.worstSlot).toMatch(/^\S+, \d+:00 – \d+:(00|30)$/);
    for (const row of history.zones) {
      expect(row.recommendation === null).toBe(row.shortHours === 0);
      expect(row.peakMissing > 0).toBe(row.shortHours > 0);
    }
    expect(history.zones[0].recommendation).toMatch(
      /^(Añadir \d+ personas?|Abrir \d+ cajas? más) los \S+ de \d+:00 a \d+:(00|30)$/,
    );
  });

  it('should find a quiet store well covered and a busy one short', () => {
    const quiet = buildStaffingHistory(QUIET, 'week', MONDAY_MORNING);
    const busy = buildStaffingHistory(BUSY, 'week', MONDAY_MORNING);

    expect(quiet.shortHours).toBe(0);
    expect(quiet.coveredShare).toBe(100);
    expect(quiet.worstZone).toBeNull();
    expect(quiet.worstSlot).toBeNull();
    expect(busy.shortHours).toBeGreaterThan(quiet.shortHours);
    expect(busy.coveredShare).toBeLessThan(100);
  });

  it('should only count the hours of today that are over', () => {
    const history = buildStaffingHistory(BUSY, 'today', MONDAY_MORNING);

    expect(history.hours).toEqual([9, 10]);
    expect(history.grid).toHaveLength(1);
    expect(history.grid[0].label).toBe('Hoy');
    expect(history.shortHours).toBeLessThanOrEqual(2);
  });

  it('should have nothing to report before the first hour is over, or on a Sunday', () => {
    const early = buildStaffingHistory(BUSY, 'today', new Date(2026, 9, 5, 9, 10));
    const sunday = buildStaffingHistory(BUSY, 'today', new Date(2026, 9, 4, 18, 0));

    for (const history of [early, sunday]) {
      expect(history.shortHours).toBe(0);
      expect(history.coveredShare).toBe(100);
      expect(history.worstSlot).toBeNull();
    }
  });

  it('should give the same figures for the same store and period', () => {
    expect(buildStaffingHistory(BUSY, 'month', MONDAY_MORNING)).toEqual(
      buildStaffingHistory(BUSY, 'month', MONDAY_MORNING),
    );
  });
});
