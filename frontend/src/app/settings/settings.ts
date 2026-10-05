import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Icon } from '../shared/icon';

/** Settings shell: "General" and the "Pruebas" sub-screen to try the model on a video. */
@Component({
  selector: 'app-settings',
  imports: [Icon, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <header class="px-6 pt-6 md:px-8">
      <h1 class="text-2xl font-bold tracking-tight">Configuración</h1>

      <nav
        aria-label="Secciones de configuración"
        class="mt-4 flex gap-6 border-b border-line text-sm font-medium"
      >
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
    </header>

    <router-outlet />
  `,
})
export class Settings {
  protected readonly active = 'border-accent text-ink';
  protected readonly idle = 'border-transparent text-ink-2 hover:text-ink';
}
