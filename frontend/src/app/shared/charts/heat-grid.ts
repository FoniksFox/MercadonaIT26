import { Component, computed, input, signal } from '@angular/core';
import { formatNumber } from '../../core/format';

export interface HeatGridRow {
  label: string;
  values: readonly number[];
}

/** Grid of magnitudes (rows x columns) in one hue: the darker, the more. */
@Component({
  selector: 'app-heat-grid',
  host: { class: 'block' },
  template: `
    <div class="grid gap-0.5 text-xs" [style.grid-template-columns]="template()">
      <span></span>
      @for (column of columns(); track column) {
        <span class="pb-1 text-center text-ink-3">{{ column }}</span>
      }
      @for (row of cells(); track row.label) {
        <span class="flex items-center pr-2 text-sm text-ink-2">{{ row.label }}</span>
        @for (cell of row.cells; track cell.column) {
          <span
            class="h-8 rounded-sm outline-offset-1 hover:outline-2 hover:outline-ink"
            tabindex="0"
            [style.background]="cell.color"
            [attr.aria-label]="cell.text"
            (pointerenter)="active.set(cell.text)"
            (focus)="active.set(cell.text)"
          ></span>
        }
      }
    </div>

    <div class="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-2">
      <p class="text-sm" aria-live="polite">
        {{ active() ?? 'Pasa por una celda para ver su valor' }}
      </p>
      <p class="flex items-center gap-2">
        {{ range().min }}
        <span
          class="h-2 w-28 rounded-full"
          style="background: linear-gradient(to right, var(--seq-low), var(--seq-high))"
        ></span>
        {{ range().max }} {{ unit() }}
      </p>
    </div>
  `,
})
export class HeatGrid {
  readonly rows = input.required<readonly HeatGridRow[]>();
  readonly columns = input.required<readonly string[]>();
  /** What the numbers count, e.g. "personas/hora". */
  readonly unit = input.required<string>();

  protected readonly active = signal<string | null>(null);

  protected readonly template = computed(
    () => `5.5rem repeat(${this.columns().length}, minmax(0, 1fr))`,
  );

  private readonly bounds = computed(() => {
    const values = this.rows().flatMap((row) => row.values);
    return { min: Math.min(...values), max: Math.max(...values) };
  });

  protected readonly range = computed(() => ({
    min: formatNumber(this.bounds().min),
    max: formatNumber(this.bounds().max),
  }));

  protected readonly cells = computed(() => {
    const { min, max } = this.bounds();
    const span = Math.max(1, max - min);
    return this.rows().map((row) => ({
      label: row.label,
      cells: row.values.map((value, i) => ({
        column: this.columns()[i],
        color: `color-mix(in oklab, var(--seq-high) ${Math.round(((value - min) / span) * 100)}%, var(--seq-low))`,
        text: `${row.label}, ${this.columns()[i]}: ${formatNumber(value)} ${this.unit()}`,
      })),
    }));
  });
}
