import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { Supermarkets } from './core/supermarkets';
import { Theme } from './core/theme';
import { Icon } from './shared/icon';
import { IconName } from './shared/icons';

interface NavigationItem {
  path: string;
  label: string;
  icon: IconName;
}

type NavigationDirection = 'up' | 'down';
type NavigationGroup = 'analysis' | 'account';

/** Box of the highlight behind the active sidebar entry, in pixels inside the nav. */
interface IndicatorBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

const ANIMATION_MS = 420;

/** Dashboard shell: sidebar with the views on the left, the current view on the right. */
@Component({
  selector: 'app-root',
  imports: [Icon, RouterLink, RouterOutlet],
  styleUrl: './app.css',
  templateUrl: './app.html',
  host: { '(window:resize)': 'placeIndicator()' },
})
export class App {
  protected readonly theme = inject(Theme);
  protected readonly supermarket = inject(Supermarkets).current;
  private readonly router = inject(Router);

  protected readonly mainNavigation: readonly NavigationItem[] = [
    { path: '/maps', label: 'Mapas', icon: 'map' },
    { path: '/statistics', label: 'Estadísticas', icon: 'stats' },
    { path: '/management', label: 'Gestión', icon: 'staff' },
  ];
  protected readonly settings: NavigationItem = {
    path: '/settings',
    label: 'Configuración',
    icon: 'gear',
  };
  protected readonly storesPath = '/stores';

  /** Entries from top to bottom, as in the sidebar: decides which way the page slides in. */
  private readonly order = [
    ...this.mainNavigation.map((item) => item.path),
    this.settings.path,
    this.storesPath,
  ];

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** Sidebar entry of the current page, e.g. "/settings" for a settings page. */
  protected readonly activePath = computed(
    () => this.order.find((path) => this.url().startsWith(path)) ?? null,
  );

  protected readonly indicator = signal<IndicatorBox | null>(null);
  protected readonly navigationDirection = signal<NavigationDirection>('down');
  protected readonly isPageAnimating = signal(false);
  protected readonly indicatorFade = signal(false);

  private readonly nav = viewChild.required<ElementRef<HTMLElement>>('nav');
  private previousPath: string | null = null;
  private pageAnimationTimer?: ReturnType<typeof setTimeout>;
  private indicatorFadeTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const path = this.activePath();
      untracked(() => this.animateTo(path));
    });
    afterRenderEffect(() => {
      // Move the highlight when the page changes, or the store name changes its entry.
      this.activePath();
      this.supermarket();
      this.placeIndicator();
    });
    afterNextRender(() => {
      // The web font arrives late and can shift the entries.
      document.fonts?.ready.then(() => this.placeIndicator());
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.pageAnimationTimer);
      clearTimeout(this.indicatorFadeTimer);
    });
  }

  /** Puts the highlight behind the sidebar entry of the current page. */
  protected placeIndicator(): void {
    const active = this.nav().nativeElement.querySelector<HTMLElement>('[aria-current="page"]');
    const nav = this.nav().nativeElement;
    const box = active
      ? (() => {
          const activeRect = active.getBoundingClientRect();
          const navRect = nav.getBoundingClientRect();
          return {
            top: activeRect.top - navRect.top + nav.scrollTop,
            left: activeRect.left - navRect.left + nav.scrollLeft,
            width: activeRect.width,
            height: activeRect.height,
          };
        })()
      : null;
    if (JSON.stringify(box) !== JSON.stringify(this.indicator())) {
      this.indicator.set(box);
    }
  }

  /** Slides the page in and squeezes the highlight when the section changes. */
  private animateTo(path: string | null): void {
    const previous = this.previousPath;
    this.previousPath = path;
    if (path === null || previous === null || path === previous) {
      return;
    }
    const sameGroup = this.groupFor(previous) === this.groupFor(path);
    this.navigationDirection.set(
      this.order.indexOf(path) > this.order.indexOf(previous) ? 'down' : 'up',
    );
    this.isPageAnimating.set(false);
    clearTimeout(this.pageAnimationTimer);
    clearTimeout(this.indicatorFadeTimer);
    this.indicatorFade.set(!sameGroup);
    if (!sameGroup) {
      this.indicatorFadeTimer = setTimeout(() => this.indicatorFade.set(false), 220);
    }

    requestAnimationFrame(() => {
      this.isPageAnimating.set(true);
      this.pageAnimationTimer = setTimeout(() => this.isPageAnimating.set(false), ANIMATION_MS);
    });
  }

  private groupFor(path: string): NavigationGroup {
    return this.mainNavigation.some((item) => item.path === path) ? 'analysis' : 'account';
  }
}
