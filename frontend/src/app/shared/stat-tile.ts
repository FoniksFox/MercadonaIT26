import { Component, computed, input } from '@angular/core';
import { formatChange } from '../core/format';
import { Icon } from './icon';
import { IconName } from './icons';

/** One headline figure, optionally with its change against a named period. */
@Component({
  selector: 'app-stat-tile',
  imports: [Icon],
  host: { class: 'block' },
  template: `
    <div class="h-full rounded-2xl border border-line bg-surface shadow-sm p-5">
      <p class="flex items-center gap-2 text-sm text-ink-2">
        <app-icon [name]="icon()" class="size-4" />
        {{ label() }}
      </p>
      <p class="mt-2 text-3xl font-semibold">{{ value() }}</p>
      @if (changeText(); as text) {
        <p class="mt-2 flex items-center gap-1.5 text-sm text-ink-2">
          <app-icon [name]="change()! < 0 ? 'trending-down' : 'trending-up'" class="size-4" />
          <span class="whitespace-nowrap font-semibold text-ink">{{ text }}</span>
          {{ against() }}
        </p>
      }
    </div>
  `,
})
export class StatTile {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly icon = input.required<IconName>();
  /** Change in percent; leave unset when there is nothing to compare with. */
  readonly change = input<number>();
  /** What the change is measured against, e.g. "vs. semana anterior". */
  readonly against = input('');

  protected readonly changeText = computed(() => {
    const change = this.change();
    return change === undefined ? null : formatChange(change);
  });
}
