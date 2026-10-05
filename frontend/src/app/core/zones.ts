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
}

/** Sections of the store, in the order a shopper usually walks them. */
export const ZONES: readonly Zone[] = [
  { id: 'fruit', name: 'Fruta y verdura', icon: 'fruit', popularity: 1 },
  { id: 'bakery', name: 'Panadería', icon: 'bakery', popularity: 0.8 },
  { id: 'pantry', name: 'Despensa', icon: 'pantry', popularity: 0.9 },
  { id: 'butcher', name: 'Carnicería', icon: 'butcher', popularity: 0.65 },
  { id: 'drinks', name: 'Bebidas', icon: 'drinks', popularity: 0.6 },
  { id: 'deli', name: 'Charcutería', icon: 'deli', popularity: 0.55 },
  { id: 'household', name: 'Droguería y perfumería', icon: 'household', popularity: 0.4 },
  { id: 'fish', name: 'Pescadería', icon: 'fish', popularity: 0.45 },
  { id: 'dairy', name: 'Lácteos y congelados', icon: 'dairy', popularity: 0.85 },
  { id: 'checkout', name: 'Cajas', icon: 'checkout', popularity: 1 },
];

export function zoneById(id: ZoneId): Zone {
  return ZONES.find((zone) => zone.id === id)!;
}

/** A zero-filled counter per zone. */
export function emptyZoneCounts(): Record<ZoneId, number> {
  return Object.fromEntries(ZONES.map((zone) => [zone.id, 0])) as Record<ZoneId, number>;
}
