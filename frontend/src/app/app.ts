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
  /** Pages of the section, listed under it. The entry itself then only opens the first one. */
  pages?: readonly { path: string; label: string }[];
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

const ANIMATION_MS = 280;

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
    {
      path: '/maps',
      label: 'Mapas',
      icon: 'map',
      pages: [
        { path: '/maps', label: 'Simulación' },
        { path: '/maps/real', label: 'Real' },
      ],
    },
    { path: '/statistics', label: 'Estadísticas', icon: 'stats' },
    { path: '/management', label: 'Gestión', icon: 'staff' },
  ];
  protected readonly settings: NavigationItem = {
    path: '/settings',
    label: 'Configuración',
    icon: 'gear',
  };
  protected readonly storesPath = '/stores';

  /** Pages of the main group, top to bottom: a section counts through its pages. */
  private readonly mainPaths = this.mainNavigation.flatMap((item) =>
    item.pages ? item.pages.map((page) => page.path) : [item.path],
  );

  /** Entries from top to bottom, as in the sidebar: decides which way the page slides in. */
  private readonly order = [...this.mainPaths, this.settings.path, this.storesPath];

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /**
   * Sidebar entry of the current page: the longest one its URL starts with, so
   * "/maps/real" wins over "/maps" and a settings page maps to "/settings".
   */
  protected readonly activePath = computed(() => {
    const url = this.url();
    const matches = this.order.filter((path) => url === path || url.startsWith(path + '/'));
    return matches.sort((a, b) => b.length - a.length)[0] ?? null;
  });

  protected readonly indicator = signal<IndicatorBox | null>(null);
  protected readonly navigationDirection = signal<NavigationDirection>('down');
  protected readonly isPageAnimating = signal(false);
  protected readonly indicatorFade = signal(false);

  private readonly nav = viewChild.required<ElementRef<HTMLElement>>('nav');
  private previousPath: string | null = null;
  private pageAnimationTimer?: ReturnType<typeof setTimeout>;

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
    this.indicatorFade.set(!sameGroup);
    if (!sameGroup) {
      requestAnimationFrame(() => this.indicatorFade.set(false));
    }

    requestAnimationFrame(() => {
      this.isPageAnimating.set(true);
      this.pageAnimationTimer = setTimeout(() => this.isPageAnimating.set(false), ANIMATION_MS);
    });
  }

  private groupFor(path: string): NavigationGroup {
    return this.mainPaths.includes(path) ? 'analysis' : 'account';
  }
}
