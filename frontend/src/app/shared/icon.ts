import { Component, computed, input } from '@angular/core';
import { ICONS, IconName } from './icons';

/** Decorative line icon. Size it with a class on the host, e.g. `class="size-5"`. */
@Component({
  selector: 'app-icon',
  host: { class: 'inline-block shrink-0' },
  template: `
    <svg
      aria-hidden="true"
      class="block size-full"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      @for (d of paths(); track $index) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  protected readonly paths = computed(() => ICONS[this.name()]);
}
