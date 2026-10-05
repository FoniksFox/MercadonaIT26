import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PageHeader } from '../shared/page-header';

/** Settings shell for configuration managed by the backend. */
@Component({
  selector: 'app-settings',
  imports: [PageHeader, RouterOutlet],
  template: `
    <div class="mx-auto max-w-7xl px-6 py-8 md:px-8 md:py-10">
      <app-page-header title="Configuración" />

      <div class="page-content mt-6">
        <router-outlet />
      </div>
    </div>
  `,
})
export class Settings {
}
