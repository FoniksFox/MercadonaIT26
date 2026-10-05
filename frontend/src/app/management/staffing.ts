import { ZoneId } from '../core/zones';

// How staff is matched against customers. Placeholder rules, shared by the
// live view and the history, until the backend provides the real ones.

export type Coverage = 'covered' | 'tight' | 'short';

export const TOTAL_TILLS = 6;
export const OPEN_TILLS = 4;

type ZoneKind = 'counter' | 'till' | 'aisle';

const SERVED_COUNTERS: readonly ZoneId[] = ['bakery', 'butcher', 'deli', 'fish'];
/** Customers one member of staff (or one open till) can attend at once. */
const CAPACITY: Record<ZoneKind, number> = { counter: 3, till: 3, aisle: 8 };
/** Share of the capacity from which a zone is close to its limit. */
const TIGHT_FROM = 0.75;

/** Staff on each zone during a normal shift; for the tills, the ones that are open. */
export const STAFF_PLAN: Readonly<Record<ZoneId, number>> = {
  fruit: 1,
  bakery: 1,
  pantry: 1,
  butcher: 2,
  drinks: 1,
  deli: 1,
  household: 1,
  fish: 1,
  dairy: 1,
  checkout: OPEN_TILLS,
};

function kindOf(zone: ZoneId): ZoneKind {
  if (zone === 'checkout') {
    return 'till';
  }
  return SERVED_COUNTERS.includes(zone) ? 'counter' : 'aisle';
}

export interface StaffNeed {
  coverage: Coverage;
  /** Customers as a share of what the staff can attend: above 1 they do not cope. */
  load: number;
  /** People (or tills) missing to attend everyone; 0 unless the zone is short. */
  missing: number;
}

/** How well `staff` people cover `customers` in a zone. */
export function assess(zone: ZoneId, customers: number, staff: number): StaffNeed {
  const capacity = CAPACITY[kindOf(zone)];
  const load = customers / (staff * capacity);
  if (load <= 1) {
    return { coverage: load > TIGHT_FROM ? 'tight' : 'covered', load, missing: 0 };
  }
  // No more tills can be opened than the store has.
  const limit = zone === 'checkout' ? TOTAL_TILLS : Infinity;
  const needed = Math.min(limit, Math.ceil(customers / capacity));
  return { coverage: 'short', load, missing: Math.max(1, needed - staff) };
}

/** "1 persona", "2 personas", "1 caja", "2 cajas". */
export function staffUnits(zone: ZoneId, count: number): string {
  const unit = zone === 'checkout' ? 'caja' : 'persona';
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}
