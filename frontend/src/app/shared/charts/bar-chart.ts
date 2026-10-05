import { Component, computed, input } from '@angular/core';
import { Icon } from '../icon';
import { IconName } from '../icons';

export interface BarRow {
  label: string;
  icon: IconName;
  value: number;
  /** The value as it should be read, e.g. "1.240" or "3,4 min". */
  text: string;
}

/** Horizontal bars for one measure across categories, value at the tip of each bar. */
@Component({
  selector: 'app-bar-chart',
  imports: [Icon],
  host: { class: 'block' },
  template: `
    <ul class="space-y-1">
      @for (bar of bars(); track bar.label) {
        <li
          class="grid grid-cols-[1.25rem_11.5rem_minmax(0,1fr)] items-center gap-x-3 rounded-md px-1 py-1.5 text-sm hover:bg-sunken"
        >
          <app-icon [name]="bar.icon" class="size-5 text-ink-3" />
          <span class="truncate">{{ bar.label }}</span>
          <span class="flex items-center gap-2">
            <span class="h-3 rounded-r bg-series" [style.width.%]="bar.width"></span>
            <span class="shrink-0 font-semibold tabular-nums">{{ bar.text }}</span>
          </span>
        </li>
      }
    </ul>
  `,
})
export class BarChart {
  readonly rows = input.required<readonly BarRow[]>();

  protected readonly bars = computed(() => {
    const max = Math.max(1, ...this.rows().map((row) => row.value));
    // 85 %: leaves room for the value next to the longest bar.
    return this.rows().map((row) => ({ ...row, width: (row.value / max) * 85 }));
  });
}
