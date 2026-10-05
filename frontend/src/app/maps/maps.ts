import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { formatNumber } from '../core/format';
import { seededRandom } from '../core/random';
import { Supermarkets } from '../core/supermarkets';
import { ZONES } from '../core/zones';
import { HEAT_GRADIENT } from '../shared/heat/heat-ramp';
import { CrowdSnapshot, MapPeriod, StoreHeatmap } from '../shared/heat/store-heatmap';
import { Icon } from '../shared/icon';

const DAYS = { today: 1, week: 7, month: 30 } as const;
/** Opening hours used to scale today's placeholder totals. */
const OPENS_AT = 9;
const CLOSES_AT = 21.5;
/** People standing in a zone from which it counts as crowded. */
const CROWDED_FROM = 6;
const QUEUE_FROM = 5;

const SHORT_DATE = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

/** Home screen: the heatmap of the selected store, live or over a past period. */
@Component({
  selector: 'app-maps',
  imports: [Icon, StoreHeatmap],
  templateUrl: './maps.html',
  host: {
    '(document:click)': 'closeMenuIfOutside($event)',
    '(keydown.escape)': 'menuOpen.set(false)',
  },
})
export class Maps {
  protected readonly supermarket = inject(Supermarkets).current;

  protected readonly period = signal<MapPeriod>('live');
  protected readonly menuOpen = signal(false);
  protected readonly snapshot = signal<CrowdSnapshot | null>(null);

  protected readonly heatGradient = HEAT_GRADIENT;
  /** Past periods; the first one is the default when switching to "Histórico". */
  protected readonly pastPeriods = [
    { id: 'today', label: 'Hoy' },
    { id: 'week', label: 'Última semana' },
    { id: 'month', label: 'Último mes' },
  ] as const;

  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');

  protected readonly live = computed(() => this.period() === 'live');

  protected readonly pastLabel = computed(() => {
    const selected = this.pastPeriods.find((option) => option.id === this.period());
    return selected ? `Histórico: ${selected.label.toLowerCase()}` : 'Histórico';
  });

  /** Dates covered by the past period. Week and month end yesterday. */
  protected readonly dateRange = computed(() => {
    const period = this.period();
    if (period === 'live') {
      return '';
    }
    if (period === 'today') {
      return `${SHORT_DATE.format(new Date())}, desde las 9:00`;
    }
    const end = new Date();
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - (DAYS[period] - 1));
    return `${SHORT_DATE.format(start)} – ${SHORT_DATE.format(end)}`;
  });

  protected readonly zoneRows = computed(() => {
    const byZone = this.snapshot()?.byZone;
    if (!byZone) {
      return [];
    }
    const max = Math.max(1, ...Object.values(byZone));
    return ZONES.map((zone) => ({
      zone,
      value: byZone[zone.id],
      fill: (byZone[zone.id] / max) * 100,
    }));
  });

  protected readonly busiest = computed(() => {
    const rows = this.zoneRows();
    return rows.length ? rows.reduce((top, row) => (row.value > top.value ? row : top)) : null;
  });

  protected readonly alerts = computed(() => {
    if (!this.live()) {
      return [];
    }
    return this.zoneRows()
      .filter((row) => row.value >= (row.zone.id === 'checkout' ? QUEUE_FROM : CROWDED_FROM))
      .map((row) =>
        row.zone.id === 'checkout'
          ? { zone: row.zone, text: `${row.value} personas en cola`, action: 'Abrir otra caja' }
          : { zone: row.zone, text: `${row.value} personas a la vez`, action: 'Revisar la zona' },
      );
  });

  /** Placeholder totals of a past period, stable per store and period. */
  protected readonly pastTotals = computed(() => {
    const period = this.period();
    if (period === 'live') {
      return null;
    }
    const store = this.supermarket();
    const random = seededRandom(`${store.id}:${period}:totals`);
    const days = period === 'today' ? dayElapsed() : DAYS[period];
    return {
      visits: formatNumber(Math.round(2400 * store.busyness * days * (0.92 + random() * 0.16))),
      stayMinutes: Math.round(19 + random() * 8),
    };
  });

  protected choose(period: MapPeriod): void {
    this.period.set(period);
    this.menuOpen.set(false);
  }

  /** From live, "Histórico" shows today straight away and offers the other periods. */
  protected openPast(): void {
    if (this.live()) {
      this.period.set('today');
      this.menuOpen.set(true);
    } else {
      this.menuOpen.update((open) => !open);
    }
  }

  protected closeMenuIfOutside(event: Event): void {
    if (this.menuOpen() && !this.menu()?.nativeElement.contains(event.target as Node)) {
      this.menuOpen.set(false);
    }
  }
}

/** Fraction of today's opening hours that has already passed (0..1). */
function dayElapsed(): number {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  return Math.min(1, Math.max(0, (hour - OPENS_AT) / (CLOSES_AT - OPENS_AT)));
}
