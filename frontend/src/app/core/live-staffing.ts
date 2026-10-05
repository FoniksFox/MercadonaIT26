import { Coverage, OPEN_TILLS, STAFF_PLAN, assess, staffUnits } from './staffing';
import { ZONES, Zone, ZoneId, emptyZoneCounts } from './zones';

// Staff against customers, right now. It is fed one reading of the store per
// second (the customers standing in each zone) and keeps what the management
// view shows: the state of each zone, what to do about it and the alerts.

export interface LiveZone {
  zone: Zone;
  /** Customers in the zone, smoothed over the last seconds so it does not jitter. */
  customers: number;
  staff: number;
  coverage: Coverage;
  /** People (or tills) missing to cover the current demand. */
  missing: number;
  /** What to do about it; `null` when nothing is needed. */
  action: string | null;
}

/** A zone running short of staff, or being covered again. */
export interface StaffingEvent {
  at: Date;
  zone: Zone;
  short: boolean;
  text: string;
}

export interface LiveSnapshot {
  zones: LiveZone[];
  /** Everyone in the store, also walking between zones. */
  customers: number;
  onShift: number;
  shortZones: number;
  /** Estimated wait at the tills, in minutes. */
  tillWaitMinutes: number;
  /** Latest events, newest first. */
  events: StaffingEvent[];
}

/** Share of the gap to the current count that the smoothed count closes with each reading. */
const SMOOTHING = 0.08;
/**
 * A zone is flagged as short once it is clearly over what its staff can
 * attend, and only cleared when it is clearly back under: a customer coming or
 * going must not raise and clear an alert every few seconds.
 */
const SHORT_ABOVE = 1.1;
const RECOVERED_BELOW = 0.8;
const MINUTES_PER_CUSTOMER_AT_TILL = 1.5;
const MAX_EVENTS = 6;

export class LiveStaffing {
  private readonly smoothed = emptyZoneCounts();
  private readonly short = new Set<ZoneId>();
  private events: StaffingEvent[] = [];

  /** Takes a reading: the customers standing in each zone at `at`. Meant to be called once per second. */
  observe(standing: Readonly<Record<ZoneId, number>>, at: Date): void {
    for (const zone of ZONES) {
      const id = zone.id;
      this.smoothed[id] += (standing[id] - this.smoothed[id]) * SMOOTHING;
      const staff = STAFF_PLAN[id];
      const need = assess(id, this.smoothed[id], staff);
      if (!this.short.has(id) && need.load > SHORT_ABOVE) {
        this.short.add(id);
        this.note({
          at,
          zone,
          short: true,
          text: `${Math.round(this.smoothed[id])} clientes para ${staffUnits(id, staff)}`,
        });
      } else if (this.short.has(id) && need.load < RECOVERED_BELOW) {
        this.short.delete(id);
        this.note({ at, zone, short: false, text: 'Vuelve a estar cubierta' });
      }
    }
  }

  /** The state of every zone; `customers` is everyone in the store right now. */
  snapshot(customers: number): LiveSnapshot {
    const zones = ZONES.map((zone): LiveZone => {
      const staff = STAFF_PLAN[zone.id];
      const need = assess(zone.id, this.smoothed[zone.id], staff);
      const short = this.short.has(zone.id);
      let action: string | null = null;
      if (short) {
        const missing = Math.max(1, need.missing);
        action =
          zone.id === 'checkout'
            ? missing === 1
              ? 'Abrir otra caja'
              : `Abrir ${staffUnits(zone.id, missing)} más`
            : `Reforzar con ${staffUnits(zone.id, missing)}`;
      } else if (need.coverage !== 'covered') {
        action = 'Vigilar';
      }
      return {
        zone,
        customers: Math.round(this.smoothed[zone.id]),
        staff,
        // Over capacity but not yet flagged (or already recovering) reads as "at the limit".
        coverage: short ? 'short' : need.coverage === 'covered' ? 'covered' : 'tight',
        missing: short ? Math.max(1, need.missing) : 0,
        action,
      };
    });
    return {
      zones,
      customers,
      onShift: Object.values(STAFF_PLAN).reduce((sum, staff) => sum + staff, 0),
      shortZones: this.short.size,
      tillWaitMinutes:
        Math.round((this.smoothed.checkout / OPEN_TILLS) * MINUTES_PER_CUSTOMER_AT_TILL * 2) / 2,
      events: this.events,
    };
  }

  private note(event: StaffingEvent): void {
    this.events = [event, ...this.events].slice(0, MAX_EVENTS);
  }
}
