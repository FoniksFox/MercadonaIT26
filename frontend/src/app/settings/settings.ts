import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Icon } from '../shared/icon';
import { PageHeader } from '../shared/page-header';

/** Settings shell for configuration managed by the backend. */
@Component({
  selector: 'app-settings',
  imports: [Icon, PageHeader, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="mx-auto max-w-7xl px-6 py-6 md:px-8 md:py-8">
      <app-page-header title="Configuración" />

      <nav aria-label="Secciones de configuración" class="mt-6 flex gap-6 border-b border-line text-sm font-semibold">
        <a
          routerLink="/settings"
          routerLinkActive
          #general="routerLinkActive"
          [routerLinkActiveOptions]="{ exact: true }"
          ariaCurrentWhenActive="page"
          class="-mb-px flex items-center gap-2 border-b-2 pb-3"
          [class]="general.isActive ? active : idle"
        >
          <app-icon name="settings" class="size-4" />
          General
        </a>
        <a
          routerLink="/settings/test"
          routerLinkActive
          #test="routerLinkActive"
          ariaCurrentWhenActive="page"
          class="-mb-px flex items-center gap-2 border-b-2 pb-3"
          [class]="test.isActive ? active : idle"
        >
          <app-icon name="test" class="size-4" />
          Pruebas
        </a>
      </nav>

      <div class="page-content mt-6">
        <router-outlet />
      </div>
    </div>
  `,
})
export class Settings {
  protected readonly active = 'border-accent text-ink';
  protected readonly idle = 'border-transparent text-ink-2 hover:text-ink';
}
