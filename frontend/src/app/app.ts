import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Supermarkets } from './core/supermarkets';
import { Theme } from './core/theme';
import { Icon } from './shared/icon';
import { IconName } from './shared/icons';

interface NavigationItem {
  path: string;
  label: string;
  icon: IconName;
}

/** Dashboard shell: sidebar with the views on the left, the current view on the right. */
@Component({
  selector: 'app-root',
  imports: [Icon, RouterLink, RouterLinkActive, RouterOutlet],
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly theme = inject(Theme);
  protected readonly supermarket = inject(Supermarkets).current;

  protected readonly navigation: readonly NavigationItem[] = [
    { path: '/maps', label: 'Mapas', icon: 'map' },
    { path: '/statistics', label: 'Estadísticas', icon: 'stats' },
    { path: '/management', label: 'Gestión', icon: 'staff' },
    { path: '/settings', label: 'Configuración', icon: 'settings' },
  ];
}
