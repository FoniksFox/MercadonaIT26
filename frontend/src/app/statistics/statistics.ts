import { Component, computed, inject, signal } from '@angular/core';
import { formatNumber } from '../core/format';
import { Supermarkets } from '../core/supermarkets';
import { BarChart, BarRow } from '../shared/charts/bar-chart';
import { ChartCard } from '../shared/charts/chart-card';
import { DataTable } from '../shared/charts/data-table';
import { HeatGrid } from '../shared/charts/heat-grid';
import { LineChart, LineSeries } from '../shared/charts/line-chart';
import { StatTile } from '../shared/stat-tile';
import { OPENING_HOURS, StatsRange, buildStats } from './statistics-data';

const WEEKDAY = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });

/** What each range is compared with, e.g. "vs. lunes pasado". */
function against(range: StatsRange): string {
  switch (range) {
    case 'today':
      return `vs. ${WEEKDAY.format(new Date())} pasado`;
    case 'week':
      return 'vs. semana anterior';
    case 'month':
      return 'vs. mes anterior';
  }
}

/** Figures and charts of the selected store for one period. */
@Component({
  selector: 'app-statistics',
  imports: [BarChart, ChartCard, DataTable, HeatGrid, LineChart, StatTile],
  templateUrl: './statistics.html',
})
export class Statistics {
  private readonly supermarket = inject(Supermarkets).current;

  protected readonly range = signal<StatsRange>('today');
  protected readonly ranges = [
    { id: 'today', label: 'Hoy' },
    { id: 'week', label: 'Última semana' },
    { id: 'month', label: 'Último mes' },
  ] as const;

  protected readonly hours = OPENING_HOURS.map((hour) => `${hour}:00`);
  protected readonly shortHours = OPENING_HOURS.map((hour) => `${hour} h`);
  protected readonly gridColumns = ['Día', ...this.shortHours];

  protected readonly data = computed(() => buildStats(this.supermarket(), this.range()));
  protected readonly against = computed(() => against(this.range()));
  protected readonly visitors = computed(() => formatNumber(this.data().visitors));

  protected readonly hourlyUnit = computed(() =>
    this.range() === 'today'
      ? 'Personas que entran cada hora'
      : 'Media de personas que entran cada hora',
  );

  protected readonly hourlySeries = computed<LineSeries[]>(() => {
    const { hourly, hourlyReference } = this.data();
    return hourlyReference
      ? [
          { name: 'Hoy', values: hourly, emphasis: true },
          { name: 'Media de la última semana', values: hourlyReference },
        ]
      : [{ name: 'Media por hora', values: hourly, emphasis: true }];
  });

  protected readonly hourlyTable = computed(() => {
    const series = this.hourlySeries();
    return {
      columns: ['Hora', ...series.map((line) => line.name)],
      rows: this.hours.map((hour, i) => [
        hour,
        ...series.map((line) => (line.values[i] === null ? '–' : formatNumber(line.values[i]!))),
      ]),
    };
  });

  protected readonly visitRows = computed<BarRow[]>(() =>
    this.data().visitsByZone.map(({ zone, value }) => ({
      label: zone.name,
      icon: zone.icon,
      value,
      text: formatNumber(value),
    })),
  );

  protected readonly stayRows = computed<BarRow[]>(() =>
    this.data().stayByZone.map(({ zone, value }) => ({
      label: zone.name,
      icon: zone.icon,
      value,
      text: `${formatNumber(value)} min`,
    })),
  );

  protected readonly visitTable = computed(() => this.visitRows().map((r) => [r.label, r.text]));
  protected readonly stayTable = computed(() => this.stayRows().map((r) => [r.label, r.text]));

  protected readonly gridRows = computed(() =>
    (this.data().weekGrid ?? []).map(({ day, values }) => ({ label: day, values })),
  );

  protected readonly gridTable = computed(() =>
    this.gridRows().map((row) => [row.label, ...row.values.map((value) => formatNumber(value))]),
  );
}
