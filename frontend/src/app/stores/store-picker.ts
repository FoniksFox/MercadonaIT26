import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { Supermarket, Supermarkets } from '../core/supermarkets';
import { Icon } from '../shared/icon';

/** Choose which Mercadona to look at. Switching asks for confirmation first. */
@Component({
  selector: 'app-store-picker',
  imports: [Icon],
  templateUrl: './store-picker.html',
})
export class StorePicker {
  protected readonly supermarkets = inject(Supermarkets);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  /** Store waiting for confirmation in the warning dialog. */
  protected readonly pending = signal<Supermarket | null>(null);

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected ask(store: Supermarket): void {
    this.pending.set(store);
    // Open once the buttons exist, so the keyboard focus lands on "Cancelar".
    afterNextRender(() => this.dialog().nativeElement.showModal(), { injector: this.injector });
  }

  protected cancel(): void {
    this.dialog().nativeElement.close();
  }

  protected confirm(): void {
    const store = this.pending();
    this.dialog().nativeElement.close();
    if (store) {
      this.supermarkets.select(store.id);
      this.router.navigate(['/maps']);
    }
  }
}
