import { Component, input } from '@angular/core';
import {
  COUNTERS,
  DAIRY_WALL,
  ENTRANCE,
  EXIT,
  LABELS,
  PLAN,
  PRODUCE_ISLANDS,
  SHELVES,
  TILLS,
} from './store-layout';

/**
 * Placeholder floor plan. It is drawn in two layers so the heat can sit
 * between them: `shapes` goes under the heat and `labels` on top of it.
 */
@Component({
  selector: 'app-floor-plan',
  host: { class: 'block' },
  template: `
    <svg
      aria-hidden="true"
      class="block size-full"
      [attr.viewBox]="'0 0 ' + plan.width + ' ' + plan.height"
      preserveAspectRatio="none"
    >
      @if (layer() === 'shapes') {
        <rect x="0" y="0" [attr.width]="plan.width" [attr.height]="plan.height" fill="var(--plan-floor)" />
        <rect
          x="20"
          y="20"
          width="960"
          height="580"
          rx="10"
          fill="none"
          stroke="var(--plan-wall)"
          stroke-width="4"
        />
        <!-- Door openings in the front wall. -->
        @for (door of doors; track door.x) {
          <rect [attr.x]="door.x - 50" y="596" width="100" height="8" fill="var(--plan-floor)" />
        }
        @for (fixture of fixtures; track $index) {
          <rect
            [attr.x]="fixture.x"
            [attr.y]="fixture.y"
            [attr.width]="fixture.w"
            [attr.height]="fixture.h"
            rx="6"
            fill="var(--plan-fixture)"
          />
        }
      } @else {
        @for (label of labels; track label.text) {
          <text
            [attr.x]="label.x"
            [attr.y]="label.y"
            [attr.transform]="
              label.vertical ? 'rotate(-90 ' + label.x + ' ' + label.y + ')' : null
            "
            text-anchor="middle"
            dominant-baseline="middle"
            font-size="17"
            font-weight="600"
            fill="var(--ink-2)"
            stroke="var(--plan-floor)"
            stroke-width="5"
            stroke-linejoin="round"
            paint-order="stroke"
          >
            {{ label.text }}
          </text>
        }
      }
    </svg>
  `,
})
export class FloorPlan {
  readonly layer = input.required<'shapes' | 'labels'>();

  protected readonly plan = PLAN;
  protected readonly labels = LABELS;
  protected readonly doors = [ENTRANCE, EXIT];
  protected readonly fixtures = [
    ...COUNTERS.map((counter) => counter.rect),
    ...PRODUCE_ISLANDS,
    ...SHELVES,
    DAIRY_WALL,
    ...TILLS,
  ];
}
