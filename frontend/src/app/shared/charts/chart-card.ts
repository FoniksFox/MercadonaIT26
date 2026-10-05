import { Component, input, signal } from '@angular/core';
import { Icon } from '../icon';

/**
 * Card around a chart, with a switch to read the same data as a table.
 * Project the chart as default content and the table with the `chartTable` attribute.
 */
@Component({
  selector: 'app-chart-card',
  imports: [Icon],
  host: { class: 'block' },
  template: `
    <figure class="h-full rounded-2xl border border-line bg-surface p-5">
      <div class="mb-4 flex items-start justify-between gap-4">
        <figcaption>
          <h2 class="font-semibold">{{ title() }}</h2>
          @if (unit()) {
            <p class="mt-0.5 text-sm text-ink-2">{{ unit() }}</p>
          }
        </figcaption>
        <button
          type="button"
          class="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm text-ink-2 hover:bg-sunken"
          [attr.aria-pressed]="showTable()"
          (click)="showTable.set(!showTable())"
        >
          <app-icon [name]="showTable() ? 'chart' : 'table'" class="size-4" />
          {{ showTable() ? 'Gráfico' : 'Tabla' }}
        </button>
      </div>
      <div [hidden]="showTable()"><ng-content /></div>
      <div [hidden]="!showTable()" class="overflow-x-auto"><ng-content select="[chartTable]" /></div>
    </figure>
  `,
})
export class ChartCard {
  readonly title = input.required<string>();
  /** What the values measure, when the title alone does not say it. */
  readonly unit = input<string>();

  protected readonly showTable = signal(false);
}
