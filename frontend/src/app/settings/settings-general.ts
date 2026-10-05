import { Component, inject } from '@angular/core';
import { Theme, ThemeMode } from '../core/theme';
import { Icon } from '../shared/icon';
import { IconName } from '../shared/icons';

/** Where the video comes from (the backend) and how the app looks. */
@Component({
  selector: 'app-settings-general',
  imports: [Icon],
  template: `
    <div class="grid items-start gap-6 px-6 py-6 md:px-8 xl:grid-cols-2">
      <section class="rounded-2xl border border-line bg-surface p-5">
        <h2 class="font-semibold">Vídeo</h2>

        <dl class="mt-4 space-y-3 text-sm">
          <div class="flex items-center gap-3">
            <app-icon name="server" class="size-5 text-ink-3" />
            <dt class="text-ink-2">Origen</dt>
            <dd class="ml-auto font-medium">Cámaras de la tienda, desde el backend</dd>
          </div>
          <div class="flex items-center gap-3">
            <app-icon name="alert" class="size-5 text-brand-orange" />
            <dt class="text-ink-2">Estado</dt>
            <dd class="ml-auto font-medium">Sin conexión: se muestran datos de ejemplo</dd>
          </div>
        </dl>

        <h3 class="mt-6 text-sm font-semibold">Cámaras</h3>
        <ul class="mt-2 divide-y divide-line text-sm">
          @for (camera of cameras; track camera) {
            <li class="flex items-center gap-3 py-2.5">
              <app-icon name="camera" class="size-5 text-ink-3" />
              {{ camera }}
              <span class="ml-auto text-ink-2">Sin señal</span>
            </li>
          }
        </ul>
      </section>

      <section class="rounded-2xl border border-line bg-surface p-5">
        <h2 class="font-semibold">Apariencia</h2>

        <div class="mt-4 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Tema">
          @for (option of themes; track option.mode) {
            <button
              type="button"
              role="radio"
              class="flex items-center gap-3 rounded-xl border px-4 py-3 text-left font-medium transition-colors"
              [class]="
                theme.mode() === option.mode
                  ? 'border-accent bg-sunken'
                  : 'border-line hover:border-ink-3'
              "
              [attr.aria-checked]="theme.mode() === option.mode"
              (click)="theme.mode.set(option.mode)"
            >
              <app-icon [name]="option.icon" class="size-5" />
              {{ option.label }}
              @if (theme.mode() === option.mode) {
                <app-icon name="check" class="ml-auto size-5 text-accent" />
              }
            </button>
          }
        </div>
      </section>
    </div>
  `,
})
export class SettingsGeneral {
  protected readonly theme = inject(Theme);

  // Placeholder list until the backend reports its cameras.
  protected readonly cameras = [
    'Cámara 1 · Entrada',
    'Cámara 2 · Cajas',
    'Cámara 3 · Pasillo central',
    'Cámara 4 · Mostradores',
  ];

  protected readonly themes: readonly { mode: ThemeMode; label: string; icon: IconName }[] = [
    { mode: 'light', label: 'Claro', icon: 'sun' },
    { mode: 'dark', label: 'Oscuro', icon: 'moon' },
  ];
}
