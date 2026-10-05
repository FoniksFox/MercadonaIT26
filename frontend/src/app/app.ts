import { Component, OnDestroy, signal } from '@angular/core';

type Tab = 'maps' | 'staff' | 'settings';
type NavigationDirection = 'up' | 'down';
type MapView = 'heatmap' | 'flow' | 'occupancy';

@Component({
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App implements OnDestroy {
  protected readonly title = signal('MercaTrack');
  protected readonly activeTab = signal<Tab>('maps');
  protected readonly activeMapView = signal<MapView>('heatmap');
  protected readonly navigationDirection = signal<NavigationDirection>('down');
  protected readonly isAnimating = signal(false);
  private animationTimer?: ReturnType<typeof setTimeout>;

  private readonly tabOrder: Tab[] = ['maps', 'staff', 'settings'];

  protected selectTab(tab: Tab): void {
    if (tab === this.activeTab()) {
      return;
    }

    const currentIndex = this.tabOrder.indexOf(this.activeTab());
    const nextIndex = this.tabOrder.indexOf(tab);
    this.navigationDirection.set(nextIndex > currentIndex ? 'down' : 'up');
    this.activeTab.set(tab);
    this.isAnimating.set(false);
    clearTimeout(this.animationTimer);
    requestAnimationFrame(() => {
      this.isAnimating.set(true);
      this.animationTimer = setTimeout(() => this.isAnimating.set(false), 360);
    });
  }

  protected selectMapView(view: MapView): void {
    this.activeMapView.set(view);
  }

  ngOnDestroy(): void {
    clearTimeout(this.animationTimer);
  }
}
