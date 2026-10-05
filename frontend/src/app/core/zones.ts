import { IconName } from '../shared/icons';

export type ZoneId =
  | 'fruit'
  | 'bakery'
  | 'butcher'
  | 'deli'
  | 'fish'
  | 'dairy'
  | 'pantry'
  | 'drinks'
  | 'household'
  | 'checkout';

export interface Zone {
  id: ZoneId;
  name: string;
  icon: IconName;
  /** Relative share of shoppers that visit it (placeholder). */
  popularity: number;
  /** People that fit comfortably at once; occupancy is measured against it (placeholder). */
  capacity: number;
}

/** Sections of the store, in the order a shopper usually walks them. */
export const ZONES: readonly Zone[] = [
  { id: 'fruit', name: 'Fruta y verdura', icon: 'fruit', popularity: 1, capacity: 8 },
  { id: 'bakery', name: 'Panadería', icon: 'bakery', popularity: 0.8, capacity: 5 },
  { id: 'pantry', name: 'Despensa', icon: 'pantry', popularity: 0.9, capacity: 10 },
  { id: 'butcher', name: 'Carnicería', icon: 'butcher', popularity: 0.65, capacity: 5 },
  { id: 'drinks', name: 'Bebidas', icon: 'drinks', popularity: 0.6, capacity: 6 },
  { id: 'deli', name: 'Charcutería', icon: 'deli', popularity: 0.55, capacity: 5 },
  {
    id: 'household',
    name: 'Droguería y perfumería',
    icon: 'household',
    popularity: 0.4,
    capacity: 8,
  },
  { id: 'fish', name: 'Pescadería', icon: 'fish', popularity: 0.45, capacity: 5 },
  { id: 'dairy', name: 'Lácteos y congelados', icon: 'dairy', popularity: 0.85, capacity: 8 },
  { id: 'checkout', name: 'Cajas', icon: 'checkout', popularity: 1, capacity: 8 },
];

export function zoneById(id: ZoneId): Zone {
  return ZONES.find((zone) => zone.id === id)!;
}

/** A zero-filled counter per zone. */
export function emptyZoneCounts(): Record<ZoneId, number> {
  return Object.fromEntries(ZONES.map((zone) => [zone.id, 0])) as Record<ZoneId, number>;
}

/** Each zone's value as a whole percentage (0..100) of `whole(zone)`. */
export function zonePercentages(
  values: Readonly<Record<ZoneId, number>>,
  whole: (zone: Zone) => number,
): Record<ZoneId, number> {
  const result = emptyZoneCounts();
  for (const zone of ZONES) {
    const total = whole(zone);
    result[zone.id] = total > 0 ? Math.min(100, Math.round((values[zone.id] / total) * 100)) : 0;
  }
  return result;
}
