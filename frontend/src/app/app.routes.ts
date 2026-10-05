import { Routes } from '@angular/router';
import { Simulation } from './maps/simulation';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'maps' },
  // "Mapas" has two pages, listed under it in the sidebar: the simulation and the real data.
  { path: 'maps', pathMatch: 'full', component: Simulation, title: 'Simulación · MercaTrack' },
  {
    path: 'maps/real',
    loadComponent: () => import('./maps/real').then((m) => m.RealMap),
    title: 'Mapa real · MercaTrack',
  },
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
        loadComponent: () => import('./settings/settings-general').then((m) => m.SettingsGeneral),
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
