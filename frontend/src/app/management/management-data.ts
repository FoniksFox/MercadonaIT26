import { seededRandom } from '../core/random';
import { Supermarket } from '../core/supermarkets';
import { ZONES, Zone, ZoneId } from '../core/zones';

// Placeholder staffing per zone, stable per store, until the backend provides it.

export type Coverage = 'covered' | 'tight' | 'short';

export interface ZoneStaffing {
  zone: Zone;
  /** Customers in the zone right now. */
  people: number;
  /** Staff assigned to the zone. */
  staff: number;
  coverage: Coverage;
  /** What to do about it; `null` when nothing is needed. */
  action: string | null;
}

export interface Staffing {
  zones: ZoneStaffing[];
  onShift: number;
  openTills: number;
  totalTills: number;
}

const TOTAL_TILLS = 6;
const OPEN_TILLS = 4;
/** Customers one member of staff can attend at once, by kind of zone. */
const SERVED_COUNTERS: readonly ZoneId[] = ['bakery', 'butcher', 'deli', 'fish'];
const CAPACITY = { counter: 5, till: 4, aisle: 12 } as const;

export function buildStaffing(store: Supermarket): Staffing {
  const random = seededRandom(`${store.id}:staffing`);

  const zones = ZONES.map((zone): ZoneStaffing => {
    const till = zone.id === 'checkout';
    const counter = SERVED_COUNTERS.includes(zone.id);
    const capacity = till ? CAPACITY.till : counter ? CAPACITY.counter : CAPACITY.aisle;
    const people = Math.round((till ? 11 : 7 * zone.popularity) * store.busyness * (0.5 + random()));
    const staff = till ? OPEN_TILLS : counter ? 1 + Math.floor(random() * 2) : 1;
    const needed = Math.max(1, Math.ceil(people / capacity));
    const load = people / (staff * capacity);
    const coverage: Coverage = load > 1 ? 'short' : load > 0.8 ? 'tight' : 'covered';

    let action: string | null = null;
    if (coverage === 'short') {
      const missing = needed - staff;
      action = till ? 'Abrir otra caja' : `Reforzar con ${missing} ${missing === 1 ? 'persona' : 'personas'}`;
    } else if (coverage === 'tight') {
      action = 'Vigilar';
    }
    return { zone, people, staff, coverage, action };
  });

  return {
    zones,
    onShift: zones.reduce((sum, row) => sum + row.staff, 0),
    openTills: OPEN_TILLS,
    totalTills: TOTAL_TILLS,
  };
}
