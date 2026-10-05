import { Component, computed, input, signal } from '@angular/core';
import { formatNumber } from '../../core/format';

export interface LineSeries {
  name: string;
  /** One value per label; `null` where there is no data (yet). */
  values: (number | null)[];
  /** The series the chart is about; the others are drawn as gray context. */
  emphasis?: boolean;
}

const WIDTH = 720;
const HEIGHT = 260;
const MARGIN = { top: 18, right: 20, bottom: 28, left: 44 };
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;
const BASELINE = MARGIN.top + PLOT_HEIGHT;

/** Line chart over ordered labels (e.g. hours), with a crosshair readout. */
@Component({
  selector: 'app-line-chart',
  host: { class: 'block' },
  template: `
    @if (series().length > 1) {
      <ul class="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2">
        @for (line of legend(); track line.name) {
          <li class="flex items-center gap-2">
            <span class="h-0.5 w-4 rounded-full" [style.background]="line.color"></span>
            {{ line.name }}
          </li>
        }
      </ul>
    }

    <div
      class="relative"
      tabindex="0"
      role="img"
      [attr.aria-label]="label()"
      (pointermove)="pointTo($event)"
      (pointerleave)="active.set(null)"
      (blur)="active.set(null)"
      (keydown.arrowRight)="step(1)"
      (keydown.arrowLeft)="step(-1)"
    >
      <svg class="block w-full" [attr.viewBox]="viewBox" aria-hidden="true">
        @for (tick of ticks(); track tick.value) {
          <line
            [attr.x1]="left"
            [attr.x2]="right"
            [attr.y1]="tick.y"
            [attr.y2]="tick.y"
            stroke="var(--grid)"
            stroke-width="1"
          />
          <text
            [attr.x]="left - 8"
            [attr.y]="tick.y"
            text-anchor="end"
            dominant-baseline="middle"
            font-size="11"
            fill="var(--ink-3)"
            style="font-variant-numeric: tabular-nums"
          >
            {{ tick.text }}
          </text>
        }
        @for (tick of labelTicks(); track tick.text) {
          <text
            [attr.x]="tick.x"
            [attr.y]="baseline + 18"
            text-anchor="middle"
            font-size="11"
            fill="var(--ink-3)"
          >
            {{ tick.text }}
          </text>
        }

        @for (line of lines(); track line.name) {
          @if (line.area) {
            <path [attr.d]="line.area" [attr.fill]="line.color" fill-opacity="0.1" />
          }
          <path
            [attr.d]="line.path"
            fill="none"
            [attr.stroke]="line.color"
            stroke-width="2"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
          @if (line.end; as end) {
            <circle
              [attr.cx]="end.x"
              [attr.cy]="end.y"
              r="4.5"
              [attr.fill]="line.color"
              stroke="var(--surface)"
              stroke-width="2"
            />
            @if (active() === null) {
              <text
                [attr.x]="end.x"
                [attr.y]="end.y - 12"
                text-anchor="middle"
                font-size="12"
                font-weight="600"
                fill="var(--ink)"
              >
                {{ end.text }}
              </text>
            }
          }
        }

        @if (readout(); as hovered) {
          <line
            [attr.x1]="hovered.x"
            [attr.x2]="hovered.x"
            [attr.y1]="top"
            [attr.y2]="baseline"
            stroke="var(--ink-3)"
            stroke-width="1"
          />
          @for (row of hovered.rows; track row.name) {
            <circle
              [attr.cx]="hovered.x"
              [attr.cy]="row.y"
              r="4.5"
              [attr.fill]="row.color"
              stroke="var(--surface)"
              stroke-width="2"
            />
          }
        }
      </svg>

      @if (readout(); as hovered) {
        <div
          class="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-md"
          [style.left.%]="hovered.left"
        >
          <p class="text-xs text-ink-2">{{ hovered.label }}</p>
          @for (row of hovered.rows; track row.name) {
            <p class="mt-1 flex items-center gap-2 whitespace-nowrap">
              <span class="h-0.5 w-3 rounded-full" [style.background]="row.color"></span>
              <span class="font-semibold">{{ row.text }}</span>
              <span class="text-ink-2">{{ row.name }}</span>
            </p>
          }
        </div>
      }
    </div>
  `,
})
export class LineChart {
  readonly labels = input.required<readonly string[]>();
  readonly series = input.required<readonly LineSeries[]>();
  /** Accessible name of the chart. */
  readonly label = input.required<string>();

  protected readonly active = signal<number | null>(null);

  protected readonly viewBox = `0 0 ${WIDTH} ${HEIGHT}`;
  protected readonly left = MARGIN.left;
  protected readonly right = WIDTH - MARGIN.right;
  protected readonly top = MARGIN.top;
  protected readonly baseline = BASELINE;

  private readonly max = computed(() => {
    const values = this.series().flatMap((line) => line.values.filter((v) => v !== null));
    return niceCeiling(Math.max(1, ...values));
  });

  protected readonly ticks = computed(() =>
    [0, 0.25, 0.5, 0.75, 1].map((share) => ({
      value: share,
      y: this.y(this.max() * share),
      text: formatNumber(this.max() * share),
    })),
  );

  protected readonly labelTicks = computed(() =>
    this.labels().map((text, i) => ({ text, x: this.x(i) })),
  );

  protected readonly legend = computed(() =>
    this.series().map((line) => ({
      name: line.name,
      color: line.emphasis ? 'var(--series)' : 'var(--ink-3)',
    })),
  );

  protected readonly lines = computed(() =>
    // Context first, so the emphasized line is painted on top.
    [...this.series()]
      .sort((a, b) => Number(a.emphasis ?? false) - Number(b.emphasis ?? false))
      .map((line) => {
        const points = line.values
          .map((value, i) => (value === null ? null : { x: this.x(i), y: this.y(value), value }))
          .filter((point) => point !== null);
        const path = points.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join('');
        const last = points.at(-1);
        const emphasized = line.emphasis ?? false;
        return {
          name: line.name,
          color: emphasized ? 'var(--series)' : 'var(--ink-3)',
          path,
          area:
            emphasized && points.length > 1
              ? `${path}L${last!.x} ${BASELINE}L${points[0].x} ${BASELINE}Z`
              : null,
          end: emphasized && last ? { x: last.x, y: last.y, text: formatNumber(last.value) } : null,
        };
      }),
  );

  protected readonly readout = computed(() => {
    const index = this.active();
    if (index === null) {
      return null;
    }
    const x = this.x(index);
    return {
      x,
      // Keep the tooltip inside the card near both edges.
      left: Math.min(88, Math.max(12, (x / WIDTH) * 100)),
      label: this.labels()[index],
      rows: this.series()
        .filter((line) => line.values[index] !== null)
        .map((line) => ({
          name: line.name,
          color: line.emphasis ? 'var(--series)' : 'var(--ink-3)',
          y: this.y(line.values[index]!),
          text: formatNumber(line.values[index]!),
        })),
    };
  });

  protected pointTo(event: PointerEvent): void {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * WIDTH;
    const index = Math.round(((x - MARGIN.left) / PLOT_WIDTH) * (this.labels().length - 1));
    this.active.set(Math.min(this.labels().length - 1, Math.max(0, index)));
  }

  protected step(by: number): void {
    const last = this.labels().length - 1;
    const current = this.active() ?? (by > 0 ? -1 : last + 1);
    this.active.set(Math.min(last, Math.max(0, current + by)));
  }

  private x(index: number): number {
    const steps = Math.max(1, this.labels().length - 1);
    return MARGIN.left + (index / steps) * PLOT_WIDTH;
  }

  private y(value: number): number {
    return BASELINE - (value / this.max()) * PLOT_HEIGHT;
  }
}

/** Rounds up to a number that splits into four clean axis steps. */
function niceCeiling(value: number): number {
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  for (const factor of [1, 2, 4, 6, 8, 10]) {
    if (value <= factor * magnitude) {
      return factor * magnitude;
    }
  }
  return 10 * magnitude;
}
