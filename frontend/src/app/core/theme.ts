import { DOCUMENT, Service, effect, inject, signal } from '@angular/core';
import { readStored, writeStored } from './browser-storage';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'mercatrack.theme';

/** Light by default; the choice is remembered on this device. */
@Service()
export class Theme {
  private readonly document = inject(DOCUMENT);

  readonly mode = signal<ThemeMode>(readStored(STORAGE_KEY) === 'dark' ? 'dark' : 'light');

  constructor() {
    effect(() => {
      const mode = this.mode();
      this.document.documentElement.classList.toggle('dark', mode === 'dark');
      writeStored(STORAGE_KEY, mode);
    });
  }

  toggle(): void {
    this.mode.update((mode) => (mode === 'dark' ? 'light' : 'dark'));
  }
}
