import { Supermarket } from '../core/supermarkets';
import { LiveStaffing } from './live-staffing';

const STORE: Supermarket = { id: 'test', name: 'Test', city: 'Test', busyness: 1.3 };
const NOON = new Date(2026, 9, 5, 12, 0, 0);

describe('LiveStaffing', () => {
  it('should start with the store already open: customers, staff and every zone', () => {
    const snapshot = new LiveStaffing(STORE, NOON).snapshot();

    expect(snapshot.zones).toHaveLength(10);
    expect(snapshot.customers).toBeGreaterThan(5);
    expect(snapshot.onShift).toBe(14);
    expect(snapshot.tillWaitMinutes).toBeGreaterThanOrEqual(0);
  });

  it('should suggest an action exactly for the zones that are not comfortably covered', () => {
    const staffing = new LiveStaffing(STORE, NOON);
    staffing.advance(120, NOON);
    const snapshot = staffing.snapshot();

    for (const row of snapshot.zones) {
      expect(row.action === null).toBe(row.coverage === 'covered');
    }
    expect(snapshot.shortZones).toBe(
      snapshot.zones.filter((row) => row.coverage === 'short').length,
    );
  });

  it('should keep the latest alerts, newest first, dated in the past', () => {
    // A store this busy is certain to run short somewhere while it warms up.
    const staffing = new LiveStaffing({ ...STORE, busyness: 2.5 }, NOON);
    const { events } = staffing.snapshot();

    expect(events.length).toBeGreaterThan(0);
    expect(events.length).toBeLessThanOrEqual(6);
    const times = events.map((event) => event.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(times.every((time) => time < NOON.getTime())).toBe(true);
  });

  it('should move as time passes', () => {
    const staffing = new LiveStaffing(STORE, NOON);
    const before = JSON.stringify(staffing.snapshot().zones.map((row) => row.customers));

    staffing.advance(60, NOON);

    expect(JSON.stringify(staffing.snapshot().zones.map((row) => row.customers))).not.toBe(before);
  });

  it('should be the same store for the same supermarket and moment', () => {
    expect(new LiveStaffing(STORE, NOON).snapshot()).toEqual(
      new LiveStaffing(STORE, NOON).snapshot(),
    );
  });
});
