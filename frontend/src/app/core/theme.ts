import { DOCUMENT, Service, effect, inject, signal } from '@angular/core';
import { readStored, writeStored } from './browser-storage';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'mercatrack.theme';
const THEME_TRANSITION_MS = 120;

/** Light by default; the choice is remembered on this device. */
@Service()
export class Theme {
  private readonly document = inject(DOCUMENT);
  private transitionTimer?: ReturnType<typeof setTimeout>;

  readonly mode = signal<ThemeMode>(readStored(STORAGE_KEY) === 'dark' ? 'dark' : 'light');

  constructor() {
    effect(() => {
      const mode = this.mode();
      this.document.documentElement.classList.toggle('dark', mode === 'dark');
      writeStored(STORAGE_KEY, mode);
    });
  }

  toggle(): void {
    this.set(this.mode() === 'dark' ? 'light' : 'dark');
  }

  set(mode: ThemeMode): void {
    if (mode === this.mode()) {
      return;
    }
    this.startTransition();
    this.mode.set(mode);
  }

  private startTransition(): void {
    const root = this.document.documentElement;
    root.classList.add('theme-transition');
    clearTimeout(this.transitionTimer);
    this.transitionTimer = setTimeout(() => {
      root.classList.remove('theme-transition');
    }, THEME_TRANSITION_MS);
  }
}
