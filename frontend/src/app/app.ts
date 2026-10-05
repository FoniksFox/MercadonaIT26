import { Component, signal } from '@angular/core';

type Tab = 'maps' | 'staff';

@Component({
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('MercaFlow');
  protected readonly activeTab = signal<Tab>('maps');

  protected selectTab(tab: Tab): void {
    this.activeTab.set(tab);
  }
}
