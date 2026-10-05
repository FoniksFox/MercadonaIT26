import { Service, computed, signal } from '@angular/core';
import { readStored, writeStored } from './browser-storage';

export interface Supermarket {
  id: string;
  name: string;
  city: string;
  /** How busy the store is relative to an average one (1 = average). */
  busyness: number;
}

const STORAGE_KEY = 'mercatrack.supermarket';

// Placeholder list until the backend provides the real stores.
const SUPERMARKETS: readonly Supermarket[] = [
  { id: 'valencia-centro', name: 'Valencia Centro', city: 'Valencia', busyness: 1.25 },
  { id: 'valencia-campanar', name: 'Valencia Campanar', city: 'Valencia', busyness: 1 },
  { id: 'gandia', name: 'Gandía', city: 'Gandía', busyness: 0.85 },
  { id: 'paterna', name: 'Paterna', city: 'Paterna', busyness: 0.95 },
  { id: 'alcoy', name: 'Alcoy', city: 'Alcoy', busyness: 0.7 },
];

/** The stores the user can look at, and the one currently selected. */
@Service()
export class Supermarkets {
  readonly all = SUPERMARKETS;

  private readonly currentId = signal(readStored(STORAGE_KEY) ?? SUPERMARKETS[0].id);

  readonly current = computed(
    () => SUPERMARKETS.find((store) => store.id === this.currentId()) ?? SUPERMARKETS[0],
  );

  select(id: string): void {
    this.currentId.set(id);
    writeStored(STORAGE_KEY, id);
  }
}
