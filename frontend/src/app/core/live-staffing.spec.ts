import { LiveStaffing } from './live-staffing';
import { emptyZoneCounts } from './zones';

const NOON = new Date(2026, 9, 5, 12, 0, 0);

/** Feeds the same reading once per second for `seconds`, starting at `from`. */
function watch(staffing: LiveStaffing, standing: object, seconds: number, from = 0): void {
  const reading = { ...emptyZoneCounts(), ...standing };
  for (let second = from; second < from + seconds; second++) {
    staffing.observe(reading, new Date(NOON.getTime() + second * 1000));
  }
}

describe('LiveStaffing', () => {
  it('should start with every zone covered and nothing to report', () => {
    const snapshot = new LiveStaffing().snapshot(0);

    expect(snapshot.zones).toHaveLength(10);
    expect(snapshot.zones.every((row) => row.coverage === 'covered' && row.action === null)).toBe(
      true,
    );
    expect(snapshot).toMatchObject({ customers: 0, onShift: 14, shortZones: 0, events: [] });
  });

  it('should flag a zone once it stays over what its staff can attend, and say what to do', () => {
    const staffing = new LiveStaffing();
    // One person at the bakery attends three customers; six keep waiting.
    watch(staffing, { bakery: 6 }, 60);
    const snapshot = staffing.snapshot(6);
    const bakery = snapshot.zones.find((row) => row.zone.id === 'bakery')!;

    expect(bakery).toMatchObject({
      customers: 6,
      staff: 1,
      coverage: 'short',
      action: 'Reforzar con 1 persona',
    });
    expect(snapshot.shortZones).toBe(1);
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.events[0]).toMatchObject({ short: true });
    expect(snapshot.events[0].zone.id).toBe('bakery');
  });

  it('should not raise an alert for a short peak', () => {
    const staffing = new LiveStaffing();
    watch(staffing, { bakery: 6 }, 4);
    watch(staffing, { bakery: 1 }, 60, 4);

    expect(staffing.snapshot(1).events).toEqual([]);
  });

  it('should clear the alert only when the zone is clearly back under control', () => {
    const staffing = new LiveStaffing();
    watch(staffing, { bakery: 6 }, 60);
    // Three customers is exactly what one person attends: still at the limit, not recovered.
    watch(staffing, { bakery: 3 }, 120, 60);
    expect(staffing.snapshot(3).shortZones).toBe(1);

    watch(staffing, { bakery: 1 }, 120, 180);
    const snapshot = staffing.snapshot(1);

    expect(snapshot.shortZones).toBe(0);
    expect(snapshot.events.map((event) => event.short)).toEqual([false, true]);
    expect(snapshot.events[0].at.getTime()).toBeGreaterThan(snapshot.events[1].at.getTime());
  });

  it('should ask for tills at the checkout and estimate the wait', () => {
    const staffing = new LiveStaffing();
    // Four open tills attend twelve customers.
    watch(staffing, { checkout: 16 }, 120);
    const snapshot = staffing.snapshot(16);
    const tills = snapshot.zones.find((row) => row.zone.id === 'checkout')!;

    expect(tills.action).toBe('Abrir 2 cajas más');
    expect(snapshot.tillWaitMinutes).toBe(6);
  });

  it('should keep only the latest alerts', () => {
    const staffing = new LiveStaffing();
    for (let round = 0; round < 6; round++) {
      watch(staffing, { bakery: 9, deli: 9 }, 60, round * 180);
      watch(staffing, {}, 120, round * 180 + 60);
    }

    expect(staffing.snapshot(0).events).toHaveLength(6);
  });
});
