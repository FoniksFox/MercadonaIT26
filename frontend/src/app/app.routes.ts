import { Routes } from '@angular/router';
import { Maps } from './maps/maps';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'maps' },
  { path: 'maps', component: Maps, title: 'Mapas · MercaTrack' },
  {
    path: 'statistics',
    loadComponent: () => import('./statistics/statistics').then((m) => m.Statistics),
    title: 'Estadísticas · MercaTrack',
  },
  {
    path: 'management',
    loadComponent: () => import('./management/management').then((m) => m.Management),
    title: 'Gestión · MercaTrack',
  },
  {
    path: 'settings',
    loadComponent: () => import('./settings/settings').then((m) => m.Settings),
    title: 'Configuración · MercaTrack',
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./settings/settings-general').then((m) => m.SettingsGeneral),
      },
      {
        path: 'test',
        loadComponent: () => import('./settings/settings-test').then((m) => m.SettingsTest),
        title: 'Pruebas · MercaTrack',
      },
    ],
  },
  {
    path: 'stores',
    loadComponent: () => import('./stores/store-picker').then((m) => m.StorePicker),
    title: 'Cambiar de Mercadona · MercaTrack',
  },
  { path: '**', redirectTo: 'maps' },
];
