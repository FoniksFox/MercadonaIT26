import { Component, computed, inject } from '@angular/core';
import { Supermarkets } from '../core/supermarkets';
import { Icon } from '../shared/icon';
import { IconName } from '../shared/icons';
import { StatTile } from '../shared/stat-tile';
import { Coverage, buildStaffing } from './management-data';

const COVERAGE: Record<Coverage, { label: string; icon: IconName; color: string }> = {
  covered: { label: 'Cubierta', icon: 'check', color: 'text-accent' },
  tight: { label: 'Al límite', icon: 'alert', color: 'text-brand-orange' },
  short: { label: 'Falta personal', icon: 'alert', color: 'text-brand-red' },
};

/** Staff of the selected store against how busy each zone is. */
@Component({
  selector: 'app-management',
  imports: [Icon, StatTile],
  templateUrl: './management.html',
})
export class Management {
  private readonly supermarket = inject(Supermarkets).current;

  protected readonly staffing = computed(() => buildStaffing(this.supermarket()));

  protected readonly rows = computed(() =>
    this.staffing().zones.map((row) => ({ ...row, status: COVERAGE[row.coverage] })),
  );

  protected readonly shortZones = computed(
    () => this.staffing().zones.filter((row) => row.coverage === 'short').length,
  );
}
