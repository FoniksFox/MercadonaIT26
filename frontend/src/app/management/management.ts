import {
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { formatNumber } from '../core/format';
import { Supermarkets } from '../core/supermarkets';
import { BarChart, BarRow } from '../shared/charts/bar-chart';
import { ChartCard } from '../shared/charts/chart-card';
import { DataTable } from '../shared/charts/data-table';
import { HeatGrid } from '../shared/charts/heat-grid';
import { Icon } from '../shared/icon';
import { IconName } from '../shared/icons';
import { PageHeader } from '../shared/page-header';
import { StatTile } from '../shared/stat-tile';
import { LiveSnapshot, LiveStaffing } from './live-staffing';
import { Coverage, OPEN_TILLS, TOTAL_TILLS, recommendedStaff } from './staffing';
import { HistoryRange, buildStaffingHistory } from './staffing-history';

type ManagementRange = 'live' | HistoryRange;

const COVERAGE: Record<Coverage, { label: string; icon: IconName; color: string }> = {
  covered: { label: 'Cubierta', icon: 'check', color: 'text-accent' },
  tight: { label: 'Al límite', icon: 'alert', color: 'text-brand-orange' },
  short: { label: 'Falta personal', icon: 'alert', color: 'text-brand-red' },
};

type StaffAdjustment = 'add' | 'remove' | 'none';

/** How often the live store moves forward, and how often the screen is refreshed. */
const TICK_MS = 250;
const TICKS_PER_REFRESH = 4;

const CLOCK = new Intl.DateTimeFormat('es-ES', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/**
 * Staff against customers. Live: each zone right now, with what to do about
 * it and the alerts as they happen. Past periods: where and when staff fell
 * short, and what to change in the rota.
 */
@Component({
  selector: 'app-management',
  imports: [BarChart, ChartCard, DataTable, HeatGrid, Icon, PageHeader, StatTile],
  templateUrl: './management.html',
})
export class Management {
  private readonly supermarket = inject(Supermarkets).current;

  protected readonly range = signal<ManagementRange>('live');
  protected readonly ranges = [
    { id: 'live', label: 'En vivo' },
    { id: 'today', label: 'Hoy' },
    { id: 'week', label: 'Última semana' },
    { id: 'month', label: 'Último mes' },
  ] as const;

  protected readonly tills = `${OPEN_TILLS} de ${TOTAL_TILLS}`;

  // ---------- Live ----------

  protected readonly now = signal<LiveSnapshot | null>(null);

  protected readonly liveRows = computed(() =>
    (this.now()?.zones ?? []).map((row) => {
      const target = recommendedStaff(row.zone.id, row.customers);
      const adjustment: StaffAdjustment =
        row.coverage === 'short' ? 'add' : row.staff > target ? 'remove' : 'none';
      const amount =
        adjustment === 'add'
          ? row.missing
          : adjustment === 'remove'
            ? row.staff - target
            : 0;
      return { ...row, status: COVERAGE[row.coverage], adjustment, amount };
    }),
  );

  protected readonly events = computed(() =>
    (this.now()?.events ?? []).map((event) => ({ ...event, time: CLOCK.format(event.at) })),
  );

  protected readonly tillWait = computed(() => {
    const minutes = this.now()?.tillWaitMinutes ?? 0;
    return minutes < 0.5 ? 'Sin espera' : `${formatNumber(minutes)} min`;
  });

  // ---------- Past periods ----------

  protected readonly past = computed(() => {
    const range = this.range();
    return range === 'live' ? null : buildStaffingHistory(this.supermarket(), range);
  });

  protected readonly shortRows = computed<BarRow[]>(() =>
    (this.past()?.zones ?? []).map((row) => ({
      label: row.zone.name,
      icon: row.zone.icon,
      value: row.shortHours,
      text: `${formatNumber(row.shortHours)} h`,
    })),
  );
  protected readonly shortTable = computed(() => this.shortRows().map((r) => [r.label, r.text]));

  protected readonly gridColumns = computed(() =>
    (this.past()?.hours ?? []).map((hour) => `${hour} h`),
  );
  protected readonly gridRows = computed(() => this.past()?.grid ?? []);
  protected readonly gridTableColumns = computed(() => ['Día', ...this.gridColumns()]);
  protected readonly gridTable = computed(() =>
    this.gridRows().map((row) => [row.label, ...row.values.map((value) => formatNumber(value))]),
  );
  /** Whether anything was missing at all: an all-zero grid says nothing. */
  protected readonly anyShortage = computed(() => (this.past()?.shortHours ?? 0) > 0);

  private readonly destroyRef = inject(DestroyRef);
  private staffing: LiveStaffing | null = null;
  private ticks = 0;

  constructor() {
    effect(() => {
      const store = this.supermarket();
      untracked(() => {
        this.staffing = new LiveStaffing(store);
        this.now.set(this.staffing.snapshot());
      });
    });
    afterNextRender(() => {
      // The store keeps running behind the other periods, so "En vivo" is current on return.
      const timer = setInterval(() => this.tick(), TICK_MS);
      this.destroyRef.onDestroy(() => clearInterval(timer));
    });
  }

  private tick(): void {
    if (!this.staffing) {
      return;
    }
    this.staffing.advance(TICK_MS / 1000);
    this.ticks += 1;
    if (this.ticks % TICKS_PER_REFRESH === 0) {
      this.now.set(this.staffing.snapshot());
    }
  }
}
