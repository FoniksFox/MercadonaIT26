import { Component, inject, input } from '@angular/core';
import { Supermarkets } from '../core/supermarkets';

/**
 * Heading of a page: the store being looked at, the page title and, projected
 * on the right, the controls that scope the whole page.
 */
@Component({
  selector: 'app-page-header',
  host: { class: 'block' },
  template: `
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="text-sm font-semibold tracking-[0.2em] text-accent uppercase">
          Mercadona {{ supermarket().name }}
        </p>
        <h1 class="mt-2 text-4xl font-bold tracking-tight">{{ title() }}</h1>
      </div>
      <div class="flex flex-wrap items-center gap-3"><ng-content /></div>
    </header>
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  protected readonly supermarket = inject(Supermarkets).current;
}
